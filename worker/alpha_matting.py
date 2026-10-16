"""
Alpha Matting and Edge Refinement Pipeline for Remote Worker.
Implements:
1. Conservative 3-class trimap construction (0: bg, 128: unknown, 255: fg).
2. Closed-Form Alpha Matting via PyMatting (with NumPy/SciPy fallback).
3. Edge-aware Guided Filter to align alpha transitions with RGB edges and eliminate halos.
4. Safe CPU/RAM limits: bounded resolution processing + full-resolution RGB restoration.
5. Preserves fine hair, thin text strokes, semi-transparent boundaries.

LIMITATION NOTICE:
Alpha matting refines boundary transitions and semi-transparent hair/text edges
within the trimap's unknown zone; it cannot reconstruct strokes or regions that
the coarse segmentation model completely omitted.
"""

import os
import math
import numpy as np
from PIL import Image

# Max pixel budget for matting solve (e.g. 2048 x 2048 = 4,194,304 pixels)
MAX_MATTING_PIXELS = int(os.getenv("MAX_MATTING_PIXELS", 4194304))

# Check for PyMatting availability
try:
    from pymatting import estimate_alpha_cf
    HAS_PYMATTING = True
except ImportError:
    HAS_PYMATTING = False

# Check for OpenCV availability
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


def _box_filter_2d(img: np.ndarray, r: int) -> np.ndarray:
    """
    Fast O(1) per pixel 2D box filter using cumulative sum.
    Requires only pure NumPy.
    """
    h, w = img.shape
    padded = np.pad(img, ((r, r), (r, r)), mode="edge")
    cum = np.cumsum(np.cumsum(padded, axis=0), axis=1)

    # Box sum over [y - r, y + r] and [x - r, x + r]
    # Coordinates in cum array:
    # y2 = y + 2*r + 1, y1 = y
    # x2 = x + 2*r + 1, x1 = x
    y1 = np.arange(h)
    y2 = y1 + 2 * r + 1
    x1 = np.arange(w)
    x2 = x1 + 2 * r + 1

    box_sum = (
        cum[y2[:, None], x2[None, :]]
        - cum[y1[:, None], x2[None, :]]
        - cum[y2[:, None], x1[None, :]]
        + cum[y1[:, None], x1[None, :]]
    )
    count = (2 * r + 1) ** 2
    return box_sum / count


def guided_filter(
    guide_rgb: np.ndarray,
    src_alpha: np.ndarray,
    radius: int = 4,
    eps: float = 1e-4,
) -> np.ndarray:
    """
    Edge-preserving guided filter.
    Filters src_alpha using guide_rgb color gradients as guidance.
    Ensures alpha follows sharp image boundaries and suppresses color halos.

    Args:
        guide_rgb: float32 array in [0, 1] of shape (H, W, 3) or (H, W)
        src_alpha: float32 array in [0, 1] of shape (H, W)
        radius: filter window radius
        eps: regularization parameter
    Returns:
        refined_alpha: float32 array in [0, 1] of shape (H, W)
    """
    # Use cv2.ximgproc.guidedFilter if available
    if HAS_CV2 and hasattr(cv2, "ximgproc") and hasattr(cv2.ximgproc, "guidedFilter"):
        try:
            guide_u8 = np.clip(guide_rgb * 255.0, 0, 255).astype(np.uint8)
            src_u8 = np.clip(src_alpha * 255.0, 0, 255).astype(np.uint8)
            filtered = cv2.ximgproc.guidedFilter(
                guide=guide_u8,
                src=src_u8,
                radius=radius,
                eps=eps * (255.0 ** 2),
            )
            return filtered.astype(np.float32) / 255.0
        except Exception:
            pass

    # Pure NumPy implementation using monochrome or channel-averaged guide
    if guide_rgb.ndim == 3 and guide_rgb.shape[2] == 3:
        # Convert RGB to luminance guide: Y = 0.299R + 0.587G + 0.114B
        I = (
            0.299 * guide_rgb[:, :, 0]
            + 0.587 * guide_rgb[:, :, 1]
            + 0.114 * guide_rgb[:, :, 2]
        ).astype(np.float32)
    else:
        I = guide_rgb.astype(np.float32)

    p = src_alpha.astype(np.float32)

    mean_I = _box_filter_2d(I, radius)
    mean_p = _box_filter_2d(p, radius)
    mean_Ip = _box_filter_2d(I * p, radius)
    cov_Ip = mean_Ip - mean_I * mean_p

    mean_II = _box_filter_2d(I * I, radius)
    var_I = mean_II - mean_I * mean_I

    a = cov_Ip / (var_I + eps)
    b = mean_p - a * mean_I

    mean_a = _box_filter_2d(a, radius)
    mean_b = _box_filter_2d(b, radius)

    q = mean_a * I + mean_b
    return np.clip(q, 0.0, 1.0)


def build_conservative_trimap(
    coarse_alpha: np.ndarray,
    quality: str = "balanced",
) -> np.ndarray:
    """
    Builds a conservative 3-class trimap from a coarse alpha mask:
      - 0.0: definite background
      - 0.5: unknown boundary (128)
      - 1.0: definite foreground

    Uses conservative morphology so fine hair and thin text strokes
    are assigned to the unknown region rather than forced to 0 or 1.

    Args:
        coarse_alpha: float32 array in [0, 1] of shape (H, W)
        quality: "fast" | "balanced" | "quality"
    Returns:
        trimap: float32 array in {0.0, 0.5, 1.0} of shape (H, W)
    """
    # Thresholds: very conservative to protect subtle strokes and transparency
    fg_thresh = 0.94
    bg_thresh = 0.06

    is_fg = coarse_alpha >= fg_thresh
    is_bg = coarse_alpha <= bg_thresh

    # Morphological dilation/erosion kernel radius
    if quality == "fast":
        radius = 3
    elif quality == "quality":
        radius = 8
    else:  # balanced
        radius = 5

    if HAS_CV2:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1)
        )
        # Erode definite foreground into inner core
        fg_eroded = cv2.erode(is_fg.astype(np.uint8), kernel) > 0
        # Erode definite background (or dilate non-bg)
        bg_eroded = cv2.erode(is_bg.astype(np.uint8), kernel) > 0
    else:
        # Fallback pure NumPy box erosion
        box_fg = _box_filter_2d(is_fg.astype(np.float32), radius)
        fg_eroded = box_fg >= 0.99
        box_bg = _box_filter_2d(is_bg.astype(np.float32), radius)
        bg_eroded = box_bg >= 0.99

    # Build trimap: start with unknown (0.5)
    trimap = np.full(coarse_alpha.shape, 0.5, dtype=np.float32)
    # Assign definite background (0.0)
    trimap[bg_eroded] = 0.0
    # Assign definite foreground (1.0)
    trimap[fg_eroded] = 1.0

    return trimap


def solve_alpha_matting(
    rgb: np.ndarray,
    trimap: np.ndarray,
    quality: str = "balanced",
) -> np.ndarray:
    """
    Solves for the unknown alpha values in the trimap.
    Uses PyMatting Closed-Form Matting if available; otherwise uses
    edge-guided iterative propagation.

    Args:
        rgb: float32 array in [0, 1] of shape (H, W, 3)
        trimap: float32 array in {0.0, 0.5, 1.0} of shape (H, W)
        quality: "fast" | "balanced" | "quality"
    Returns:
        alpha: float32 array in [0, 1] of shape (H, W)
    """
    if HAS_PYMATTING:
        try:
            # PyMatting Closed-Form Matting
            alpha = estimate_alpha_cf(rgb, trimap, laplacian_scale=1e-5)
            return np.clip(alpha, 0.0, 1.0)
        except Exception as e:
            # Fall back to guided propagation on memory or numerical error
            pass

    # High-quality fallback: multi-scale guided filter over unknown trimap
    alpha = trimap.copy()
    # Initial unknown values seeded from smoothed trimap
    unknown_mask = trimap == 0.5
    smoothed = _box_filter_2d(trimap, 7)
    alpha[unknown_mask] = smoothed[unknown_mask]

    # Two iterations of guided filter with fine radius
    rad = 4 if quality == "fast" else 6
    alpha = guided_filter(rgb, alpha, radius=rad, eps=1e-4)

    # Keep definite foreground and background pinned
    alpha[trimap == 1.0] = 1.0
    alpha[trimap == 0.0] = 0.0

    return np.clip(alpha, 0.0, 1.0)


def refine_alpha_matting_pipeline(
    orig_img: Image.Image,
    coarse_alpha_img: Image.Image,
    quality: str = "balanced",
) -> Image.Image:
    """
    Full End-to-End Alpha Matting Pipeline:
    1. Bounded resolution check (downscale for safe matting solve if huge).
    2. Build conservative 3-class trimap.
    3. Solve Closed-Form Alpha Matting.
    4. Edge-aware Guided Filter pass to reduce halos.
    5. Restore to original full dimensions.
    6. Attach refined alpha to original RGB image.

    Args:
        orig_img: Original full-resolution PIL Image (RGB or RGBA)
        coarse_alpha_img: 1-channel PIL Image of coarse alpha mask [0..255]
        quality: "fast" | "balanced" | "quality"
    Returns:
        rgba_result: Full-resolution PIL Image (mode RGBA) with refined alpha
    """
    orig_w, orig_h = orig_img.size
    total_pixels = orig_w * orig_h

    # Bounded resolution limit for the matting solver
    if quality == "fast":
        max_dim = 1024
    elif quality == "quality":
        max_dim = 1600
    else:  # balanced
        max_dim = 1280

    needs_scale = max(orig_w, orig_h) > max_dim or total_pixels > MAX_MATTING_PIXELS

    if needs_scale:
        scale = max_dim / max(orig_w, orig_h)
        solve_w = max(1, int(orig_w * scale))
        solve_h = max(1, int(orig_h * scale))

        solve_rgb_pil = orig_img.convert("RGB").resize((solve_w, solve_h), Image.LANCZOS)
        solve_alpha_pil = coarse_alpha_img.resize((solve_w, solve_h), Image.BILINEAR)
    else:
        solve_w, solve_h = orig_w, orig_h
        solve_rgb_pil = orig_img.convert("RGB")
        solve_alpha_pil = coarse_alpha_img

    # Convert to float32 [0, 1] arrays
    rgb_arr = np.asarray(solve_rgb_pil, dtype=np.float32) / 255.0
    coarse_alpha_arr = np.asarray(solve_alpha_pil, dtype=np.float32) / 255.0

    # 1. Build conservative 3-class trimap
    trimap = build_conservative_trimap(coarse_alpha_arr, quality=quality)

    # 2. Solve Closed-Form Alpha Matting
    solved_alpha = solve_alpha_matting(rgb_arr, trimap, quality=quality)

    # 3. Edge-aware Guided Filter smoothing on the solved alpha
    gf_rad = 3 if quality == "fast" else 4
    refined_alpha = guided_filter(rgb_arr, solved_alpha, radius=gf_rad, eps=1e-4)

    # 4. Upscale alpha back to original resolution if it was downscaled
    if needs_scale:
        alpha_u8 = (np.clip(refined_alpha, 0.0, 1.0) * 255.0).astype(np.uint8)
        alpha_pil = Image.fromarray(alpha_u8, mode="L").resize(
            (orig_w, orig_h), Image.LANCZOS
        )

        # Apply final lightweight full-resolution edge-aware pass
        orig_rgb_arr = np.asarray(orig_img.convert("RGB"), dtype=np.float32) / 255.0
        full_alpha_arr = np.asarray(alpha_pil, dtype=np.float32) / 255.0
        final_alpha_arr = guided_filter(orig_rgb_arr, full_alpha_arr, radius=2, eps=1e-4)
        final_alpha_u8 = (np.clip(final_alpha_arr, 0.0, 1.0) * 255.0).astype(np.uint8)
        final_alpha_pil = Image.fromarray(final_alpha_u8, mode="L")
    else:
        final_alpha_u8 = (np.clip(refined_alpha, 0.0, 1.0) * 255.0).astype(np.uint8)
        final_alpha_pil = Image.fromarray(final_alpha_u8, mode="L")

    # 5. Attach refined alpha directly to the original RGB channels
    # Original RGB values are NEVER altered, only the alpha boundary is refined
    r_orig, g_orig, b_orig = orig_img.convert("RGB").split()
    return Image.merge("RGBA", (r_orig, g_orig, b_orig, final_alpha_pil))

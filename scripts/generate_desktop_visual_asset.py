from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "desktop" / "assets" / "jarvis-command-core.png"
WIDTH = 1536
HEIGHT = 864


def clamp(value: float) -> int:
    return max(0, min(255, int(round(value))))


def blend(dst: tuple[int, int, int, int], src: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    alpha = src[3] / 255
    inv = 1 - alpha
    return (
        clamp(src[0] * alpha + dst[0] * inv),
        clamp(src[1] * alpha + dst[1] * inv),
        clamp(src[2] * alpha + dst[2] * inv),
        255,
    )


def put(px: bytearray, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if x < 0 or y < 0 or x >= WIDTH or y >= HEIGHT:
        return
    idx = (y * WIDTH + x) * 4
    current = (px[idx], px[idx + 1], px[idx + 2], px[idx + 3])
    px[idx : idx + 4] = bytes(blend(current, color))


def draw_line(px: bytearray, x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        put(px, x0, y0, color)
        if x0 == x1 and y0 == y1:
            break
        step = 2 * err
        if step >= dy:
            err += dy
            x0 += sx
        if step <= dx:
            err += dx
            y0 += sy


def draw_ring(px: bytearray, cx: int, cy: int, radius: float, thickness: float, color: tuple[int, int, int, int]) -> None:
    min_x = max(0, int(cx - radius - thickness - 2))
    max_x = min(WIDTH - 1, int(cx + radius + thickness + 2))
    min_y = max(0, int(cy - radius - thickness - 2))
    max_y = min(HEIGHT - 1, int(cy + radius + thickness + 2))
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            dist = math.hypot(x - cx, y - cy)
            edge = abs(dist - radius)
            if edge <= thickness:
                fade = 1 - edge / max(thickness, 1)
                put(px, x, y, (color[0], color[1], color[2], clamp(color[3] * fade)))


def make_pixels() -> bytearray:
    px = bytearray(WIDTH * HEIGHT * 4)
    cx = WIDTH // 2
    cy = HEIGHT // 2
    for y in range(HEIGHT):
        for x in range(WIDTH):
            nx = x / (WIDTH - 1)
            ny = y / (HEIGHT - 1)
            dist = math.hypot((x - cx) / WIDTH, (y - cy) / HEIGHT)
            glow = max(0, 1 - dist * 2.4)
            scan = 10 if y % 8 == 0 else 0
            grid = 18 if x % 96 == 0 or y % 96 == 0 else 0
            r = 6 + 20 * ny + 18 * glow + grid + scan
            g = 14 + 42 * glow + 16 * (1 - ny) + grid + scan
            b = 16 + 22 * nx + 34 * glow + grid
            idx = (y * WIDTH + x) * 4
            px[idx : idx + 4] = bytes((clamp(r), clamp(g), clamp(b), 255))

    for offset in range(-360, 361, 120):
        draw_line(px, cx + offset, 96, cx - offset // 2, HEIGHT - 96, (67, 217, 196, 38))
        draw_line(px, 120, cy + offset // 2, WIDTH - 120, cy - offset, (240, 184, 79, 26))

    for radius, alpha in [(98, 130), (158, 90), (232, 60), (318, 42)]:
        draw_ring(px, cx, cy, radius, 2.2, (67, 217, 196, alpha))
    for radius, alpha in [(124, 80), (276, 46)]:
        draw_ring(px, cx, cy, radius, 1.6, (240, 184, 79, alpha))

    for angle in range(0, 360, 18):
        rad = math.radians(angle)
        inner = 88 if angle % 36 else 62
        outer = 340 if angle % 54 else 400
        x0 = cx + int(math.cos(rad) * inner)
        y0 = cy + int(math.sin(rad) * inner)
        x1 = cx + int(math.cos(rad) * outer)
        y1 = cy + int(math.sin(rad) * outer)
        draw_line(px, x0, y0, x1, y1, (156, 248, 237, 55 if angle % 54 else 95))

    for y in range(cy - 44, cy + 45):
        for x in range(cx - 44, cx + 45):
            dist = math.hypot(x - cx, y - cy)
            if dist <= 44:
                intensity = 1 - dist / 44
                put(px, x, y, (232, 255, 251, clamp(210 * intensity)))
                put(px, x, y, (67, 217, 196, clamp(160 * (1 - intensity))))

    return px


def write_png(path: Path, pixels: bytearray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = bytearray()
    stride = WIDTH * 4
    for y in range(HEIGHT):
        rows.append(0)
        start = y * stride
        rows.extend(pixels[start : start + stride])

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), level=9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    write_png(OUT, make_pixels())
    print(OUT)


if __name__ == "__main__":
    main()

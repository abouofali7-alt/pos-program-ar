import cv2
import numpy as np
import os
import math
from PIL import Image

def load_img(path, target_w=1280, target_h=720):
    pil_img = Image.open(path).convert('RGB')
    pil_img = pil_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
    arr = np.array(pil_img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

def draw_gear(img, center, radius, teeth, angle_deg, color, inner_r, spokes=4):
    cx, cy = center
    angle_rad = math.radians(angle_deg)
    
    # Outer gear circle with teeth
    points = []
    num_pts = teeth * 4
    for i in range(num_pts):
        a = angle_rad + (i * 2 * math.pi / num_pts)
        r = radius if (i % 4 < 2) else (radius * 0.84)
        x = int(cx + r * math.cos(a))
        y = int(cy + r * math.sin(a))
        points.append([x, y])
        
    pts = np.array(points, np.int32)
    cv2.fillPoly(img, [pts], color)
    cv2.polylines(img, [pts], True, (255, 255, 255), 2, cv2.LINE_AA)
    
    # Inner hole
    cv2.circle(img, (cx, cy), int(radius * 0.55), (10, 15, 25), -1, cv2.LINE_AA)
    cv2.circle(img, (cx, cy), int(radius * 0.55), color, 2, cv2.LINE_AA)
    
    # Axle spokes
    for k in range(spokes):
        sa = angle_rad + (k * 2 * math.pi / spokes)
        sx = int(cx + radius * 0.52 * math.cos(sa))
        sy = int(cy + radius * 0.52 * math.sin(sa))
        cv2.line(img, (cx, cy), (sx, sy), color, 3, cv2.LINE_AA)
        
    # Center rivet
    cv2.circle(img, (cx, cy), inner_r, color, -1, cv2.LINE_AA)
    cv2.circle(img, (cx, cy), int(inner_r * 0.4), (255, 255, 255), -1, cv2.LINE_AA)

def build_realistic_film_mp4():
    base_dir = r"D:\مجلد جديد (3)\assets\cinema"
    img1 = load_img(os.path.join(base_dir, "frame1.jpg"))
    img2 = load_img(os.path.join(base_dir, "frame2.jpg"))
    img3 = load_img(os.path.join(base_dir, "frame3.jpg"))
    img4 = load_img(os.path.join(base_dir, "frame4.jpg"))

    target_w, target_h = 1280, 720
    fps = 30
    total_seconds = 18.5
    total_frames = int(fps * total_seconds) # 555 frames

    out_mp4 = os.path.join(base_dir, "intro_movie.mp4")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_mp4, fourcc, fps, (target_w, target_h))

    s1_frames = int(fps * 4.5)  # 0..135: Walking approach
    s2_frames = int(fps * 4.0)  # 135..255: Dusting wipe
    s3_frames = int(fps * 4.0)  # 255..375: Gears & Engine motor
    s4_frames = total_frames - (s1_frames + s2_frames + s3_frames) # 375..555: Title light up

    # Generate flying dust particles
    np.random.seed(42)
    dust_particles = []
    for _ in range(70):
        dust_particles.append({
            'x': np.random.randint(0, target_w),
            'y': np.random.randint(0, target_h),
            'r': np.random.uniform(1.0, 3.5),
            'vx': np.random.uniform(-0.8, 0.8),
            'vy': np.random.uniform(-1.2, -0.3),
            'alpha': np.random.uniform(0.3, 0.7)
        })

    for i in range(total_frames):
        frame = np.zeros((target_h, target_w, 3), dtype=np.uint8)

        # -------------------------------------------------------------
        # SCENE 1: Person Walking Approach (0s -> 4.5s)
        # -------------------------------------------------------------
        if i < s1_frames:
            t = i / s1_frames
            scale = 1.0 + 0.12 * t
            pan_x = int(-20 * (1 - t))
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            M[0, 2] += pan_x
            base_f = cv2.warpAffine(img1, M, (target_w, target_h))

            # Draw walking human silhouette
            walk_progress = t
            hx = int(150 + walk_progress * 420)
            hy = int(480 + math.sin(i * 0.5) * 5)
            
            overlay = base_f.copy()
            cv2.circle(overlay, (hx, hy - 140), 22, (20, 25, 35), -1, cv2.LINE_AA)
            cv2.ellipse(overlay, (hx, hy - 145), (24, 14), 0, 180, 360, (245, 158, 11), -1, cv2.LINE_AA)
            pts_torso = np.array([[hx - 25, hy - 118], [hx + 25, hy - 118], [hx + 18, hy - 40], [hx - 18, hy - 40]], np.int32)
            cv2.fillPoly(overlay, [pts_torso], (30, 40, 55))
            
            stride = math.sin(i * 0.4) * 28
            cv2.line(overlay, (hx - 10, hy - 40), (int(hx - 10 - stride), hy + 40), (15, 20, 30), 12, cv2.LINE_AA)
            cv2.line(overlay, (hx + 10, hy - 40), (int(hx + 10 + stride), hy + 40), (25, 35, 50), 12, cv2.LINE_AA)

            frame = cv2.addWeighted(overlay, 0.9, base_f, 0.1, 0)

            if i >= s1_frames - 25:
                blend_alpha = (s1_frames - i) / 25.0
                frame = cv2.addWeighted(frame, blend_alpha, img2, 1.0 - blend_alpha, 0)

        # -------------------------------------------------------------
        # SCENE 2: Dusting & Cleaning Gears (4.5s -> 8.5s)
        # -------------------------------------------------------------
        elif i < s1_frames + s2_frames:
            local_i = i - s1_frames
            t = local_i / s2_frames

            scale = 1.10 - 0.08 * t
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            base_f = cv2.warpAffine(img2, M, (target_w, target_h))

            wipe_x = int(target_w * 0.3 + math.sin(local_i * 0.25) * 260)
            wipe_y = int(target_h * 0.5 + math.cos(local_i * 0.25) * 80)

            dust_mask = np.ones((target_h, target_w), dtype=np.float32) * (1.0 - t * 0.9)
            cv2.circle(dust_mask, (wipe_x, wipe_y), int(140 + t * 80), 0.0, -1)
            dust_mask = cv2.GaussianBlur(dust_mask, (51, 51), 0)
            dust_mask_3d = np.dstack([dust_mask]*3)

            dust_color = np.full_like(base_f, (120, 115, 110), dtype=np.uint8)
            frame = (base_f * (1.0 - dust_mask_3d * 0.6) + dust_color * (dust_mask_3d * 0.6)).astype(np.uint8)

            cv2.circle(frame, (wipe_x, wipe_y), 24, (245, 158, 11), -1, cv2.LINE_AA)
            cv2.line(frame, (wipe_x - 80, wipe_y + 90), (wipe_x, wipe_y), (56, 189, 248), 16, cv2.LINE_AA)

            if local_i >= s2_frames - 25:
                blend_alpha = (s2_frames - local_i) / 25.0
                frame = cv2.addWeighted(frame, blend_alpha, img3, 1.0 - blend_alpha, 0)

        # -------------------------------------------------------------
        # SCENE 3: Gear Spin & Engine Motor Spark (8.5s -> 12.5s)
        # -------------------------------------------------------------
        elif i < s1_frames + s2_frames + s3_frames:
            local_i = i - (s1_frames + s2_frames)
            t = local_i / s3_frames

            vib_x = int(math.sin(local_i * 0.8) * 3)
            vib_y = int(math.cos(local_i * 0.8) * 3)
            M = np.float32([[1, 0, vib_x], [0, 1, vib_y]])
            base_f = cv2.warpAffine(img3, M, (target_w, target_h))

            frame = base_f.copy()

            angle_cw = (local_i * 7.0) % 360
            angle_ccw = (-local_i * 10.5) % 360

            draw_gear(frame, (640, 360), 110, 18, angle_cw, (11, 158, 245), 28)
            draw_gear(frame, (480, 270), 75, 14, angle_ccw, (248, 189, 56), 20)
            draw_gear(frame, (800, 440), 60, 10, angle_cw, (15, 240, 255), 16)

            p1_h = int(30 + math.sin(local_i * 0.6) * 18)
            p2_h = int(30 - math.sin(local_i * 0.6) * 18)
            cv2.rectangle(frame, (920, 220), (955, 220 + p1_h), (56, 189, 248), -1)
            cv2.rectangle(frame, (970, 220), (1005, 220 + p2_h), (56, 189, 248), -1)

            if np.random.rand() > 0.4:
                sp_x1 = np.random.randint(600, 950)
                sp_y1 = np.random.randint(200, 400)
                sp_x2 = sp_x1 + np.random.randint(-40, 40)
                sp_y2 = sp_y1 + np.random.randint(-40, 40)
                cv2.line(frame, (sp_x1, sp_y1), (sp_x2, sp_y2), (255, 240, 200), 2, cv2.LINE_AA)

            if local_i >= s3_frames - 25:
                blend_alpha = (s3_frames - local_i) / 25.0
                frame = cv2.addWeighted(frame, blend_alpha, img4, 1.0 - blend_alpha, 0)

        # -------------------------------------------------------------
        # SCENE 4: AR-PROGRAM Title Neon Illumination (12.5s -> 18.5s)
        # -------------------------------------------------------------
        else:
            local_i = i - (s1_frames + s2_frames + s3_frames)
            t = local_i / s4_frames

            scale = 1.0 + 0.03 * math.sin(t * math.pi)
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            frame = cv2.warpAffine(img4, M, (target_w, target_h))

            glow_i = int(10 + math.sin(local_i * 0.15) * 8)
            cv2.circle(frame, (target_w//2, target_h//2 - 60), 280, (56, 189, 248), glow_i, cv2.LINE_AA)

        for p in dust_particles:
            p['x'] = (p['x'] + p['vx']) % target_w
            p['y'] = (p['y'] + p['vy']) % target_h
            px, py = int(p['x']), int(p['y'])
            cv2.circle(frame, (px, py), int(p['r']), (200, 220, 255), -1, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    print("Continuous movie rendered successfully:", out_mp4)

if __name__ == "__main__":
    build_realistic_film_mp4()

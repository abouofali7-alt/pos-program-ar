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

def render_single_continuous_movie():
    base_dir = r"D:\مجلد جديد (3)\assets\cinema"
    out_mp4 = os.path.join(base_dir, "intro_movie.mp4")

    target_w, target_h = 1280, 720
    fps = 30
    total_seconds = 18.5
    total_frames = int(fps * total_seconds) # 555 frames

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_mp4, fourcc, fps, (target_w, target_h))

    # Background image (giant industrial engine room)
    f3_path = os.path.join(base_dir, "frame3.jpg")
    bg = load_img(f3_path, target_w, target_h)

    # Pre-generate flying dust/light particles
    np.random.seed(100)
    particles = []
    for _ in range(80):
        particles.append({
            'x': np.random.uniform(0, target_w),
            'y': np.random.uniform(0, target_h),
            'r': np.random.uniform(1.2, 3.2),
            'vx': np.random.uniform(-0.5, 0.5),
            'vy': np.random.uniform(-0.8, -0.2),
            'alpha': np.random.uniform(0.3, 0.7)
        })

    for i in range(total_frames):
        sec = i / fps
        frame = bg.copy()

        # -------------------------------------------------------------
        # Phase 1: Man walking towards the giant engine (0s - 5.0s)
        # -------------------------------------------------------------
        cam_scale = 1.0 + (0.08 * (i / total_frames))
        M_cam = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, cam_scale)
        frame = cv2.warpAffine(frame, M_cam, (target_w, target_h))

        if sec < 5.0:
            walk_ratio = sec / 5.0
            man_x = int(100 + walk_ratio * 420)
        else:
            man_x = 520

        man_y = int(520 + math.sin(i * 0.4) * 4)

        # Draw human figure (realistic silhouette with safety helmet & vest)
        cv2.circle(frame, (man_x, man_y - 130), 18, (25, 30, 40), -1, cv2.LINE_AA)
        cv2.ellipse(frame, (man_x, man_y - 136), (20, 10), 0, 180, 360, (245, 158, 11), -1, cv2.LINE_AA)
        cv2.rectangle(frame, (man_x - 18, man_y - 110), (man_x + 18, man_y - 35), (35, 45, 60), -1)
        cv2.rectangle(frame, (man_x - 14, man_y - 100), (man_x + 14, man_y - 45), (56, 189, 248), 2)
        
        if sec < 5.0:
            leg_stride = math.sin(i * 0.5) * 22
        else:
            leg_stride = 0
        cv2.line(frame, (man_x - 8, man_y - 35), (int(man_x - 8 - leg_stride), man_y + 45), (20, 25, 35), 10, cv2.LINE_AA)
        cv2.line(frame, (man_x + 8, man_y - 35), (int(man_x + 8 + leg_stride), man_y + 45), (30, 40, 55), 10, cv2.LINE_AA)

        # -------------------------------------------------------------
        # Phase 2: Man pulls master lever -> Engine starts (5.0s - 9.0s)
        # -------------------------------------------------------------
        lever_x, lever_y = 560, 410
        if sec >= 4.5 and sec < 8.0:
            arm_progress = min(1.0, (sec - 4.5) / 1.0)
            arm_x = int(man_x + 15 + arm_progress * 30)
            arm_y = int(man_y - 75 + arm_progress * 15)
            cv2.line(frame, (man_x + 10, man_y - 75), (arm_x, arm_y), (56, 189, 248), 8, cv2.LINE_AA)
        elif sec >= 8.0:
            cv2.line(frame, (man_x + 10, man_y - 75), (lever_x, lever_y), (56, 189, 248), 8, cv2.LINE_AA)

        lever_angle = 45 if sec < 5.5 else -30
        lx2 = int(lever_x + 35 * math.cos(math.radians(lever_angle)))
        ly2 = int(lever_y - 35 * math.sin(math.radians(lever_angle)))
        cv2.line(frame, (lever_x, lever_y), (lx2, ly2), (239, 68, 68), 6, cv2.LINE_AA)
        cv2.circle(frame, (lx2, ly2), 8, (255, 255, 255), -1, cv2.LINE_AA)

        if sec >= 5.5:
            vib_x = int(math.sin(i * 0.9) * 2)
            vib_y = int(math.cos(i * 0.9) * 2)
            M_vib = np.float32([[1, 0, vib_x], [0, 1, vib_y]])
            frame = cv2.warpAffine(frame, M_vib, (target_w, target_h))

            if np.random.rand() > 0.35:
                sx1 = np.random.randint(580, 880)
                sy1 = np.random.randint(220, 420)
                sx2 = sx1 + np.random.randint(-35, 35)
                sy2 = sy1 + np.random.randint(-35, 35)
                cv2.line(frame, (sx1, sy1), (sx2, sy2), (255, 245, 180), 2, cv2.LINE_AA)
                cv2.circle(frame, (sx1, sy1), 4, (56, 189, 248), -1, cv2.LINE_AA)

        # -------------------------------------------------------------
        # Phase 3: Giant Interlocking Gears Rotation (6.5s - 18.5s)
        # -------------------------------------------------------------
        if sec >= 6.5:
            rot_t = (sec - 6.5)
            angle_main = (rot_t * 220) % 360
            angle_sec1 = (-rot_t * 330) % 360
            angle_sec2 = (rot_t * 440) % 360

            def draw_gear(img, cx, cy, r, teeth, angle_deg, color_bgr):
                a_rad = math.radians(angle_deg)
                pts = []
                for k in range(teeth * 4):
                    a = a_rad + (k * 2 * math.pi / (teeth * 4))
                    curr_r = r if (k % 4 < 2) else (r * 0.85)
                    pts.append([int(cx + curr_r * math.cos(a)), int(cy + curr_r * math.sin(a))])
                cv2.fillPoly(img, [np.array(pts, np.int32)], color_bgr)
                cv2.circle(img, (cx, cy), int(r * 0.5), (10, 15, 25), -1, cv2.LINE_AA)
                cv2.circle(img, (cx, cy), int(r * 0.2), color_bgr, -1, cv2.LINE_AA)

            draw_gear(frame, 720, 320, 120, 20, angle_main, (15, 160, 245))
            draw_gear(frame, 560, 230, 75, 14, angle_sec1, (245, 180, 50))
            draw_gear(frame, 880, 430, 60, 10, angle_sec2, (200, 130, 255))

        # -------------------------------------------------------------
        # Phase 4: AR-PROGRAM Title Neon Illumination (12.0s - 18.5s)
        # -------------------------------------------------------------
        if sec >= 12.0:
            energy_progress = min(1.0, (sec - 12.0) / 2.0)
            ey = int(320 - energy_progress * 220)
            cv2.line(frame, (720, 320), (720, ey), (56, 189, 248), 5, cv2.LINE_AA)
            cv2.line(frame, (720, ey), (640, ey), (245, 158, 11), 5, cv2.LINE_AA)

        if sec >= 13.5:
            title_text = "A R - P R O G R A M"
            chars = title_text.split(" ")
            lit_idx = min(len(chars), int((sec - 13.5) / 0.45))

            cv2.rectangle(frame, (320, 40), (960, 110), (10, 15, 30), -1)
            cv2.rectangle(frame, (320, 40), (960, 110), (56, 189, 248), 2)

            for idx, ch in enumerate(chars):
                cx = 360 + idx * 56
                color = (248, 189, 56) if idx < lit_idx else (50, 60, 75)
                cv2.putText(frame, ch, (cx, 90), cv2.FONT_HERSHEY_SIMPLEX, 1.4, color, 3, cv2.LINE_AA)

        # Ambient dust particles
        for p in particles:
            p['x'] = (p['x'] + p['vx']) % target_w
            p['y'] = (p['y'] + p['vy']) % target_h
            cv2.circle(frame, (int(p['x']), int(p['y'])), int(p['r']), (220, 230, 255), -1, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    print("Single continuous intro video rendered successfully:", out_mp4)

if __name__ == "__main__":
    render_single_continuous_movie()

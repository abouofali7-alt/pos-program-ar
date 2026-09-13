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

def render_photorealistic_movie():
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

    s1_f = int(fps * 4.5)  # 0..135: Walking approach
    s2_f = int(fps * 4.0)  # 135..255: Dusting gears
    s3_f = int(fps * 4.5)  # 255..390: Gears & Engine motor
    s4_f = total_frames - (s1_f + s2_f + s3_f) # 390..555: Neon light-up

    # Pre-generate atmospheric dust & light particles
    np.random.seed(42)
    particles = []
    for _ in range(75):
        particles.append({
            'x': np.random.uniform(0, target_w),
            'y': np.random.uniform(0, target_h),
            'r': np.random.uniform(1.2, 3.2),
            'vx': np.random.uniform(-0.6, 0.6),
            'vy': np.random.uniform(-0.9, -0.2),
        })

    for i in range(total_frames):
        # -------------------------------------------------------------
        # Phase 1: Man walking towards the machine console (0s -> 4.5s)
        # -------------------------------------------------------------
        if i < s1_f:
            t = i / s1_f
            scale = 1.0 + 0.10 * t
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            frame = cv2.warpAffine(img1, M, (target_w, target_h))

            if i >= s1_f - 30:
                alpha = (s1_f - i) / 30.0
                frame = cv2.addWeighted(frame, alpha, img2, 1.0 - alpha, 0)

        # -------------------------------------------------------------
        # Phase 2: Wiping dust off the gears (4.5s -> 8.5s)
        # -------------------------------------------------------------
        elif i < s1_f + s2_f:
            local_i = i - s1_f
            t = local_i / s2_f

            scale = 1.08 - 0.06 * t
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            frame = cv2.warpAffine(img2, M, (target_w, target_h))

            wipe_x = int(target_w * 0.4 + math.sin(local_i * 0.22) * 220)
            wipe_y = int(target_h * 0.45 + math.cos(local_i * 0.22) * 60)
            cv2.circle(frame, (wipe_x, wipe_y), 35, (255, 240, 200), 2, cv2.LINE_AA)

            if local_i >= s2_f - 30:
                alpha = (s2_f - local_i) / 30.0
                frame = cv2.addWeighted(frame, alpha, img3, 1.0 - alpha, 0)

        # -------------------------------------------------------------
        # Phase 3: Engine running & gears spinning (8.5s -> 13.0s)
        # -------------------------------------------------------------
        elif i < s1_f + s2_f + s3_f:
            local_i = i - (s1_f + s2_f)
            t = local_i / s3_f

            vib_x = int(math.sin(local_i * 0.8) * 3)
            vib_y = int(math.cos(local_i * 0.8) * 3)
            M = np.float32([[1, 0, vib_x], [0, 1, vib_y]])
            frame = cv2.warpAffine(img3, M, (target_w, target_h))

            if np.random.rand() > 0.3:
                sx1 = np.random.randint(400, 900)
                sy1 = np.random.randint(200, 450)
                sx2 = sx1 + np.random.randint(-40, 40)
                sy2 = sy1 + np.random.randint(-40, 40)
                cv2.line(frame, (sx1, sy1), (sx2, sy2), (255, 245, 180), 2, cv2.LINE_AA)

            if local_i >= s3_f - 30:
                alpha = (s3_f - local_i) / 30.0
                frame = cv2.addWeighted(frame, alpha, img4, 1.0 - alpha, 0)

        # -------------------------------------------------------------
        # Phase 4: AR-PROGRAM Neon Title Light-Up Climax (13.0s -> 18.5s)
        # -------------------------------------------------------------
        else:
            local_i = i - (s1_f + s2_f + s3_f)
            t = local_i / s4_f

            scale = 1.0 + 0.03 * math.sin(t * math.pi)
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            frame = cv2.warpAffine(img4, M, (target_w, target_h))

            glow = int(12 + math.sin(local_i * 0.2) * 8)
            cv2.circle(frame, (target_w//2, 220), 280, (255, 189, 56), glow, cv2.LINE_AA)

        for p in particles:
            p['x'] = (p['x'] + p['vx']) % target_w
            p['y'] = (p['y'] + p['vy']) % target_h
            cv2.circle(frame, (int(p['x']), int(p['y'])), int(p['r']), (220, 235, 255), -1, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    print("Photorealistic cinema movie rendered successfully:", out_mp4)

if __name__ == "__main__":
    render_photorealistic_movie()

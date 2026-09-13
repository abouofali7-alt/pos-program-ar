import cv2
import numpy as np
import os
import math
from PIL import Image

def load_img(path):
    pil_img = Image.open(path).convert('RGB')
    arr = np.array(pil_img)
    # PIL loads in RGB, OpenCV expects BGR
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

def build_cinematic_mp4():
    base_dir = r"D:\مجلد جديد (3)\assets\cinema"
    f1_path = os.path.join(base_dir, "frame1.jpg")
    f2_path = os.path.join(base_dir, "frame2.jpg")
    f3_path = os.path.join(base_dir, "frame3.jpg")
    f4_path = os.path.join(base_dir, "frame4.jpg")

    img1 = load_img(f1_path)
    img2 = load_img(f2_path)
    img3 = load_img(f3_path)
    img4 = load_img(f4_path)

    target_w, target_h = 1280, 720
    fps = 30
    total_seconds = 18.5
    total_frames = int(fps * total_seconds)

    def prep(img):
        return cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

    img1 = prep(img1)
    img2 = prep(img2)
    img3 = prep(img3)
    img4 = prep(img4)

    out_mp4 = os.path.join(base_dir, "intro_movie.mp4")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_mp4, fourcc, fps, (target_w, target_h))

    s1_frames = int(fps * 4.5)  # 0 -> 135
    s2_frames = int(fps * 4.0)  # 135 -> 255
    s3_frames = int(fps * 4.0)  # 255 -> 375
    s4_frames = total_frames - (s1_frames + s2_frames + s3_frames)

    fade_len = int(fps * 1.0) # 1 ثانية انتقال تدريجي

    for i in range(total_frames):
        if i < s1_frames:
            t = i / s1_frames
            scale = 1.0 + (0.08 * t)
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            frame = cv2.warpAffine(img1, M, (target_w, target_h))

            if i >= s1_frames - fade_len:
                alpha = (s1_frames - i) / fade_len
                frame = cv2.addWeighted(frame, alpha, img2, 1 - alpha, 0)

        elif i < s1_frames + s2_frames:
            local_i = i - s1_frames
            t = local_i / s2_frames
            scale = 1.08 - (0.06 * t)
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            frame = cv2.warpAffine(img2, M, (target_w, target_h))

            if local_i >= s2_frames - fade_len:
                alpha = (s2_frames - local_i) / fade_len
                frame = cv2.addWeighted(frame, alpha, img3, 1 - alpha, 0)

        elif i < s1_frames + s2_frames + s3_frames:
            local_i = i - (s1_frames + s2_frames)
            t = local_i / s3_frames
            dx = math.sin(i * 0.4) * 2
            dy = math.cos(i * 0.4) * 2
            M = np.float32([[1, 0, dx], [0, 1, dy]])
            frame = cv2.warpAffine(img3, M, (target_w, target_h))

            if local_i >= s3_frames - fade_len:
                alpha = (s3_frames - local_i) / fade_len
                frame = cv2.addWeighted(frame, alpha, img4, 1 - alpha, 0)

        else:
            local_i = i - (s1_frames + s2_frames + s3_frames)
            t = local_i / s4_frames
            scale = 1.0 + (0.04 * math.sin(t * math.pi))
            M = cv2.getRotationMatrix2D((target_w/2, target_h/2), 0, scale)
            frame = cv2.warpAffine(img4, M, (target_w, target_h))

        writer.write(frame)

    writer.release()
    print("Video rendered successfully:", out_mp4)

if __name__ == "__main__":
    build_cinematic_mp4()

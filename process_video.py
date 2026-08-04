import os
import subprocess
import sys

def process_video(video_path):
    output_dir = "video_artifacts"
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Extract audio for transcription (e.g., via local Whisper or an API)
    audio_path = os.path.join(output_dir, "audio.mp3")
    subprocess.run(["ffmpeg", "-i", video_path, "-q:a", "0", "-map", "a", audio_path, "-y"])
    
    # 2. Extract 1 frame per second to capture visual content
    frame_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    subprocess.run(["ffmpeg", "-i", video_path, "-vf", "fps=1", frame_pattern, "-y"])
    
    print(f"Artifacts saved to {output_dir}. Audio extracted and frames generated.")

if __name__ == "__main__":
    process_video(sys.argv[1])

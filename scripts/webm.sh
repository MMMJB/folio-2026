#!/bin/bash

for file in public/videos/*.mp4; do
  filename=$(basename -- "$file")
  filename="${filename%.*}"

  echo "Processing $filename..."

  # MP4 - H.264 (maximum compatibility)
  ffmpeg -y -i "$file" \
    -c:v libx264 \
    -preset fast \
    -crf 22 \
    -profile:v high \
    -level 4.0 \
    -pix_fmt yuv420p \
    -movflags +faststart \
    -an \
    "public/videos/${filename}.mp4"

  # WebM - VP9 (better compression for modern browsers)
  ffmpeg -y -i "$file" \
    -c:v libvpx-vp9 \
    -preset 1 \
    -crf 32 \
    -b:v 0 \
    -pix_fmt yuv420p \
    -an \
    "public/videos/${filename}.webm"

done
#!/bin/bash

for file in public/videos/*.mp4; do
  filename=$(basename -- "$file")
  filename="${filename%.*}"
  # compress to webm using ffmpeg (no audio)
  ffmpeg -i "$file" -c:v libvpx-vp9 -b:v 1M -an "public/videos/${filename}.webm"
done
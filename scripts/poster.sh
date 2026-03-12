# extract the first frame from all videos in public/videos and save them as jpgs in public/thumbnails
# greatly compress the jpgs to reduce file size
for video in public/videos/*.mp4; do
  filename=$(basename "$video" .mp4)
  ffmpeg -i "$video" -ss 00:00:01.000 -vframes 1 "public/thumbnails/$filename.png"
  sips -s format jpeg "public/thumbnails/$filename.png" --out "public/thumbnails/$filename.jpg" -s formatOptions 0 --resampleWidth 200
  rm "public/thumbnails/$filename.png"
done
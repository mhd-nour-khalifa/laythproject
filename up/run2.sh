#!/bin/zsh
cd /Users/med/laythproject
for s in a b c; do
  tools/resr/realesrgan-ncnn-vulkan -i work/n$s -o up/$s -n realesr-animevideov3-x4 -m tools/resr/models -f png > up/log_$s.txt 2>&1
  .venv/bin/python work/enc4k.py $s
done
echo ALLDONE

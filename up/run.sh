#!/bin/zsh
cd /Users/med/laythproject
for p in "f1 a" "f2 b" "f3 c"; do set -- ${=p}
  tools/resr/realesrgan-ncnn-vulkan -i work/$1 -o up/$2 -n realesr-animevideov3-x4 -m tools/resr/models -f png > up/log_$2.txt 2>&1
done
echo DONE > up/done.txt
cd /Users/med/laythproject/work && ../.venv/bin/python comp4k.py a b c

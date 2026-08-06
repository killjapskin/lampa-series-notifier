from pathlib import Path
from html import escape
from IPython.display import HTML, display

code = Path("/mnt/data/SeriesNotify-1.1.8.js").read_text(encoding="utf-8")
html = f"""
<div style="font-family: sans-serif; margin-bottom: 8px;">
  <strong>SeriesNotify/SeriesNotify.js, версия 1.1.8</strong>
</div>
<textarea readonly spellcheck="false"
style="width:100%;height:720px;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;line-height:1.4;white-space:pre;overflow:auto;padding:12px;">{escape(code)}</textarea>
"""
display(HTML(html))

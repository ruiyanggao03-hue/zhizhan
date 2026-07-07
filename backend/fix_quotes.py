import os
os.chdir(r"D:\智瞻--智能化投资助手\backend")
path = os.path.join("routers", "sentiment.py")
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
content = content.replace("“", '"').replace("”", '"')
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed!")

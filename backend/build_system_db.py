import os
from dotenv import load_dotenv
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

# 加载环境秘钥
load_dotenv()

PDF_FOLDER = "./system_RAG_databases"
DB_DIR = "./chroma_db"
COLLECTION_NAME = "zhizhan_system_reports"

def build_database():
    print("🚀 [智瞻系统库构建] 正在初始化数据流...")
    
    if not os.path.exists(PDF_FOLDER) or not os.listdir(PDF_FOLDER):
        print(f"❌ 错误: 请先创建 {PDF_FOLDER} 文件夹并将您的行业研报 PDF 丢进去！")
        return

    # 1. 批量加载 PDF
    all_docs = []
    for filename in os.listdir(PDF_FOLDER):
        if filename.endswith(".pdf"):
            file_path = os.path.join(PDF_FOLDER, filename)
            print(f"📄 正在解析 PDF: {filename}")
            try:
                loader = PyMuPDFLoader(file_path)
                all_docs.extend(loader.load())
            except Exception as e:
                print(f"   ⚠️ 文件 {filename} 解析失败, 已跳过: {e}")
            
    if not all_docs:
        print("❌ 没有成功解析任何有效 PDF 文档。")
        return

    # 2. 核心：高级 RAG 递归切片处理 (Chunking)
    print("✂️ 正在进行工业级语义分块处理 (带元数据保留)...")
    
    # 【优化点1】：自定义多级分隔符，确保不会把一句话硬生生切断
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,       
        chunk_overlap=150,    # 【优化点2】：增大重叠区至150字，保证上下文绝对连贯
        separators=["\n\n", "\n", "。", "！", "？", "；", "，", " "]
    )
    
    # 【优化点3】：数据清洗与元数据 (Metadata) 注入
    clean_docs = []
    for doc in all_docs:
        # 清洗掉 PDF 中常见的乱码、多余空格和无意义的换行
        clean_text = doc.page_content.replace("\n", " ").replace("  ", " ").strip()
        if len(clean_text) > 50: # 抛弃少于 50 个字的无意义残页
            doc.page_content = clean_text
            # 确保 Metadata 里有出处，方便后续重排和溯源
            doc.metadata["source"] = os.path.basename(doc.metadata.get("source", "未知文档.pdf"))
            clean_docs.append(doc)

    chunks = text_splitter.split_documents(clean_docs)
    print(f"✅ 精细化分块成功！共生成 {len(chunks)} 个高质量知识碎片。")

    # 3. 向量化入库并持久化保存
    print("🧠 正在加载本地 BAAI BGE 中文向量模型 (首次运行会自动下载)...")
    # 2. 替换为免费强大的本地 BGE 模型
    embeddings = HuggingFaceEmbeddings(
        model_name="BAAI/bge-small-zh-v1.5",
        model_kwargs={'device': 'cpu'},  # 如果你有N卡，可以改为 'cuda' 加速
        encode_kwargs={'normalize_embeddings': True} # 归一化，提升余弦相似度计算精度
    )
    
    Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=DB_DIR,
        collection_name=COLLECTION_NAME
    )
    print(f"🎉 [大功告成] 系统公共研报知识库已成功建立，持久化数据保存在 {DB_DIR}。")

if __name__ == "__main__":
    build_database()
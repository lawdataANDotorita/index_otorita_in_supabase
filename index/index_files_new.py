import pandas as pd
import os
import requests
from bs4 import BeautifulSoup
import re
from supabase import create_client, Client
import time
import sys
import voyageai
import requests

# from langchain.text_splitter import RecursiveCharacterTextSplitter


def get_pirsom_data_by_docnm(docNm):
    url = "https://otorita.net/otorita_test/getpirsomdatabypirsomnmindb.asp"
    params = {'docNm': docNm}
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        print(f"Error fetching data for docNm '{docNm}': {e}")
        return ""

# Function to create overlapping chunks
def create_chunks(words, chunk_size, overlap):
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = words[i:i + chunk_size]
        chunks.append({
            'chunk':' '.join(chunk),
            'vector': None,
        })
    return chunks

def get_exe_directory():
    # When running as exe, this gets the exe's directory
    # When running as script, gets the script's directory
    if getattr(sys, 'frozen', False):
        # Running as executable
        return os.path.dirname(sys.executable)
    else:
        # Running as script
        return os.path.dirname(os.path.abspath(__file__))

def get_embedding(text):
    response = voyage_ai_client.embed(text, model="voyage-3.5",input_type="document")
    return response.embeddings[0]

current_dir = get_exe_directory()

# Path to the voyage_api_key.txt file
voyage_api_key_path = os.path.join(current_dir, 'voyage_api_key.txt')

# Read the Voyage AI key from the file
with open(voyage_api_key_path, 'r') as f:
    voyage_api_key = f.read().strip()

voyage_ai_client=voyageai.Client(api_key=voyage_api_key)

url: str = "https://rmigfbegvrilgentysif.supabase.co"
key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtaWdmYmVndnJpbGdlbnR5c2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk0MzEwMjMsImV4cCI6MjA0NTAwNzAyM30.S3HRecwWknLROuORA_nfOlizw5VFOeHp01ku3Y8f89M"
supabase: Client = create_client(url, key)



# local_dir: str = r"C:\Users\shay\my_projects\index_otorita_in_supabase\index\otorita_pages_query\Query"
# local_dir: str = r"C:\Users\shay\my_projects\index_otorita_in_supabase\index\otorita_pages_query\tables_for_worlds_ai_search"
local_dir: str = r"c:\users\shay\alltmp\query"
local_dir: str = r"c:\inetpub\datafax\datafaxdb\pages\query"
local_dir: str = r"C:\Users\shay\my_projects\index_otorita_in_supabase\index\otorita_pages_query\Query"

files_with_times = []
# Get timestamp from 2 months ago
time_frame = time.time() - (60 * 60 * 24 * 120)  # 120 days in seconds

time_frame = time.time() - (60 * 60 * 24 * 2)  # 2 days in seconds

time_frame = time.time() - (60 * 60 * 24 * 100000)  # 278 years in seconds


for f in os.listdir(local_dir):
    if f.endswith(('.html', '.txt')):
        file_path = os.path.join(local_dir, f)
        mod_time = os.path.getmtime(file_path)
        # Only append files that are within the time frame
        if mod_time >= time_frame:
            files_with_times.append((f, mod_time))

# Sort files by modification time (newest first)
files_with_times.sort(key=lambda x: x[1], reverse=True)

# Extract just the filenames from files_with_times
html_and_txt_files = [filename for filename, _ in files_with_times]

# iterate on all the files in the directory
for file_name in html_and_txt_files:
    file_name_clean = os.path.splitext(file_name)[0]
#    print(file_name_clean)

    to_continue=True
    local_addr=f"{local_dir}\\{file_name}"
    try:
        with open(local_addr, 'r', encoding='windows-1255') as f:
            document_content = f.read()

    except Exception as e:
        print(f"An error occurred: {e}")
        to_continue=False

    if to_continue:
#         print(f"document content is: {document_content}")

        # Check if file is HTML before parsing with BeautifulSoup
        if file_name.endswith('.html'):
            soup = BeautifulSoup(document_content, 'html.parser')
            # Extract text from the HTML
            document_text = soup.get_text()
        else:
            document_text = document_content

#        print(f"document text is: {document_text}")


        # Check if document_text is empty
        if not document_text or document_text.isspace():
            print(f"Skipping {file_name} - document text is empty")
            continue




        # Skip if file doesn't start with tbl_
        if file_name.startswith('tbl_'):
            # For non-table files, create a single chunk with the entire content
            chunks = [{"chunk": document_text}]
        else:
            document_text = document_text.replace('\xa0', ' ').replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
            document_text = re.sub(r'\s+', ' ', document_text)

            
            # INSERT_YOUR_CODE
            # Split document_text into an array of words
            words = document_text.split()
            # Create overlapping chunks from the words
            chunks = create_chunks(words, chunk_size=500, overlap=75)
            


        chunks_with_vectors = []
        # Print the chunks for verification
        for i, chunk in enumerate(chunks):
            try:
                chunk["vector"]=get_embedding(chunk["chunk"])
                # Only add chunks that have successful embeddings
                if chunk["vector"] is not None:
                    chunks_with_vectors.append({
                        "content": chunk["chunk"],
                        "name_in_db": file_name_clean,
                        "doc_name": get_pirsom_data_by_docnm(file_name_clean) if get_pirsom_data_by_docnm(file_name_clean) != "" else file_name_clean,
                        "embedding": chunk["vector"],
                        "type": "table" if file_name_clean.startswith("tbl") else "article",
                    })
                else:
                    print(f"Skipping chunk {i} - embedding generation failed")
            except Exception as e:
                print(f"An error occurred for chunk {i}: {e}")
                continue


        try:
            

            # Delete existing records with the same name_in_db before inserting new ones
            try:
                delete_response = supabase.table('documents_for_work_world_for_lawyers_new').delete().eq('name_in_db', file_name_clean).execute()
                if hasattr(delete_response, 'error') and delete_response.error:
                    print(f"Error deleting existing records: {delete_response.error}")
                else:
                    print(f"Deleted existing records for {file_name_clean}")
            except Exception as e:
                print(f"Error during deletion: {e}")


            
            # Insert data into the document table
            response = supabase.table('documents_for_work_world_for_lawyers_new').insert(chunks_with_vectors).execute()

            # Check if the response contains errors
            if hasattr(response, 'error') and response.error:
                print(f"Error: {response.error}")
            else:
                print(f"Inserted {len(response.data)} row(s)")

        except Exception as e: 
            print(f"An error occurred: {e}")



              
from openai import OpenAI
import pandas as pd
import os
import requests
from bs4 import BeautifulSoup
import re
from supabase import create_client, Client
import time
import sys
# from langchain.text_splitter import RecursiveCharacterTextSplitter


# Function to create overlapping chunks
def create_chunks(sentences, chunk_size, overlap):
    chunks = []
    for i in range(0, len(sentences), chunk_size - overlap):
        chunk = sentences[i:i + chunk_size]
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
    response = openai_client.embeddings.create(
        input=text,
        model="text-embedding-3-large"  # This is the recommended model for embeddings
    )
    return response.data[0].embedding

# Get the current directory
current_dir = get_exe_directory()

# Path to the open_ai_key.txt file
open_ai_key_path = os.path.join(current_dir, 'open_ai_key.txt')

# Read the OpenAI key from the file
with open(open_ai_key_path, 'r') as f:
    open_ai_key = f.read().strip()

# Initialize the OpenAI client with the key
openai_client = OpenAI(api_key=open_ai_key)

# how many documents to process in each batch
batch_size = 6693

url: str = "https://rmigfbegvrilgentysif.supabase.co"
key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtaWdmYmVndnJpbGdlbnR5c2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk0MzEwMjMsImV4cCI6MjA0NTAwNzAyM30.S3HRecwWknLROuORA_nfOlizw5VFOeHp01ku3Y8f89M"
supabase: Client = create_client(url, key)

# Construct the full path to the Excel file
excel_path = os.path.join(current_dir, 'data.xlsx')

# Read the Excel file with explicit header specification
df = pd.read_excel(excel_path, header=0)  # Assumes the first row is the header

# Create an array to hold the data rows
data_rows = []

# Iterate over the rows and append to data_rows
for index, row in df.iterrows():
    data_row = {
        'doc_rel_index': row[0],
        'doc_db_index': row[1],
        'doc_file_name': row[2]
    }
    data_rows.append(data_row)


# Path to the current_index.txt file
index_file_path = os.path.join(current_dir, 'current_index.txt')

# Check if the file exists
if not os.path.exists(index_file_path):
    print("The current_index.txt file does not exist. if you're starting a new index process then create one and put the value -1 in it. if you're continuing from a previous index process then find the lost current_index.txt file.")
else:
    # Read the current index from the file
    with open(index_file_path, 'r') as f:
        current_index = int(f.read().strip())


# Exit the program if current_index equals the length of data_rows
if current_index == len(data_rows) - 1:
    print("All documents have been processed.")
    exit()


# Determine the end index for the range
end_index = min(len(data_rows), current_index + 1 + batch_size)
for idx in range(current_index+1, end_index):
    
    time.sleep(0.5)
    
    print(f"{idx}");
    current_index=idx

    local_addr=f"C:\\Users\\shay\\my_projects\\index_otorita_in_supabase\\index\\otorita_pages_query\\Query\\{data_rows[current_index]['doc_file_name']}.html"

    # Open the local document file
    to_continue=True
    try:
        with open(local_addr, 'r', encoding='windows-1255') as f:
            document_content = f.read()

    except Exception as e:
        print(f"An error occurred: {e}")
        to_continue=False

    if to_continue:
        # Parse the HTML content
        soup = BeautifulSoup(document_content, 'html.parser')

        # Extract text from the HTML
        document_text = soup.get_text()

        """
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50
        )
        chunks = splitter.create_documents([document_text])
        chunks = [{'chunk': chunk.page_content, 'vector': None} for chunk in chunks]

        """

        document_text = document_text.replace('\xa0', ' ').replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
        document_text = re.sub(r'\s+', ' ', document_text)

        # Split document_text into an array of lines using the specified separators
        sentences = re.split(r'[.?;!:]', document_text)
        # Remove any empty strings from the list
        sentences = [sentence.strip() for sentence in sentences if sentence.strip()]
        # Create overlapping chunks from the sentences
        chunks = create_chunks(sentences, chunk_size=30, overlap=3)


        chunks_with_vectors = []
        # Print the chunks for verification
        for i, chunk in enumerate(chunks):
            try:
                chunk["vector"]=get_embedding(chunk["chunk"])
            except Exception as e:
                print(f"An error occurred: {e}")
                chunk["vector"]=None
            chunks_with_vectors.append({
                "content": chunk["chunk"],
                "index_in_db": data_rows[current_index]['doc_db_index'],
                "embedding": chunk["vector"],
            })



        try:
            #get openai embedding
            
            # Insert data into the document table
            response = supabase.table('documents').insert(chunks_with_vectors).execute()

            # Check if the response contains errors
            if hasattr(response, 'error') and response.error:
                print(f"Error: {response.error}")
            else:
                print(f"Inserted {len(response.data)} row(s)")

        except Exception as e:
            print(f"An error occurred: {e}")

        # Write the updated current_index to the file
        with open(index_file_path, 'w') as f:
            f.write(str(current_index))



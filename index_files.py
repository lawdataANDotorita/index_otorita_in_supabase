from openai import OpenAI
import pandas as pd
import os
import requests
from bs4 import BeautifulSoup
import re

# Function to create overlapping chunks
def create_chunks(sentences, chunk_size, overlap):
    chunks = []
    for i in range(0, len(sentences), chunk_size - overlap):
        chunk = sentences[i:i + chunk_size]
        if len(chunk) == chunk_size:
            chunks.append({
                'chunk':' '.join(chunk),
                'vector': None,
            })
    return chunks


def get_embedding(text):
    response = openai_client.embeddings.create(
        input=text,
        model="text-embedding-ada-002"  # This is the recommended model for embeddings
    )
    return response.data[0].embedding

# Path to the open_ai_key.txt file
open_ai_key_path = os.path.join(current_dir, 'open_ai_key.txt')

# Read the OpenAI key from the file
with open(open_ai_key_path, 'r') as f:
    open_ai_key = f.read().strip()

# Initialize the OpenAI client with the key
openai_client = OpenAI(api_key=open_ai_key)

# how many documents to process in each batch
batch_size = 10

# Get the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))

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
        'doc_db_name': row[1],
        'doc_file_name': row[2]
    }
    data_rows.append(data_row)


# Path to the current_index.txt file
index_file_path = os.path.join(current_dir, 'current_index.txt')

# Check if the file exists
if not os.path.exists(index_file_path):
    # Create the file and write 0 to it
    with open(index_file_path, 'w') as f:
        f.write('-1')
    current_index = -1
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
    print(f"{idx}");
    current_index=idx

    remote_addr=f"https://otorita.net/otoritadb/pages/query/{data_rows[current_index]['doc_file_name']}.html"


    # Fetch the document from the remote address
    response = requests.get(remote_addr)
    # Fetch the document from the remote address with windows-1255 encoding
    response.encoding = 'windows-1255'
    # Check if the request was successful
    if response.status_code == 200:
        document_content = response.text
        # Convert the document content from windows-1255 to utf-8 encoding
        print("Document fetched successfully.")
    else:
        document_content = "err"
        print(f"Failed to fetch document. Status code: {response.status_code}")


    # Parse the HTML content
    soup = BeautifulSoup(document_content, 'html.parser')

    # Extract text from the HTML
    document_text = soup.get_text()

    lines = document_text.split('\n')
        
    # Remove empty lines or lines with only whitespace
    cleaned_lines = [line.strip() for line in lines if line.strip()]

    # Join the non-empty lines back together
    document_text = '\n'.join(cleaned_lines)


    # Split the document text into sentences
    sentences = re.split(r'(?<=[.!?;])\s+', document_text)

    # Create chunks with 5 sentences each and 1 sentence overlap
    chunks = create_chunks(sentences, 5, 1)

    # Print the chunks for verification
    for i, chunk in enumerate(chunks):
        chunk["vector"]=get_embedding(chunk["chunk"])
        print(f"Chunk {i + 1}:\n{chunk['chunk']} and vector is {chunk['vector']}\n")

    # Write the updated current_index to the file
    with open(index_file_path, 'w') as f:
        f.write(str(current_index))


#now it's supabase time

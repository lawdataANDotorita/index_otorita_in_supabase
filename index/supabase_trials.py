from supabase import create_client, Client

url: str = "https://rmigfbegvrilgentysif.supabase.co"
key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtaWdmYmVndnJpbGdlbnR5c2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk0MzEwMjMsImV4cCI6MjA0NTAwNzAyM30.S3HRecwWknLROuORA_nfOlizw5VFOeHp01ku3Y8f89M"
supabase: Client = create_client(url, key)

# Data to insert
text = "שלום ולא להתראות"
index_in_db = 111
embedding = [1.2] * 1536  # Create a vector with 1536 numbers

try:
    # Insert data into the document table
    response = supabase.table('documents').insert({
        "content": text,
        "index_in_db": index_in_db,
        "embedding": embedding
    }).execute()

    # Check if the response contains errors
    if hasattr(response, 'error') and response.error:
        print(f"Error: {response.error}")
    else:
        print(f"Inserted {len(response.data)} row(s)")
        print(f"Response data: {response.data}")

except Exception as e:
    print(f"An error occurred: {e}")
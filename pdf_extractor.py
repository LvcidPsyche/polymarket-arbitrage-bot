#!/usr/bin/env python3

import sys
import PyPDF2

def extract_text_from_pdf(pdf_path):
    """Extract text from a PDF file."""
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    text += f"\n--- Page {page_num + 1} ---\n"
                    text += page_text
                except Exception as e:
                    text += f"\n--- Page {page_num + 1} (Error: {str(e)}) ---\n"
            
            return text
    except Exception as e:
        return f"Error reading PDF: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 pdf_extractor.py <pdf_file>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    text = extract_text_from_pdf(pdf_path)
    print(text)
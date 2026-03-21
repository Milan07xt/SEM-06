import os
import re
from pathlib import Path

# Directory containing templates
templates_dir = Path(r"c:\Users\ABC\Downloads\SEM-06\face_detection\templates")

def convert_flask_to_django(content):
    """Convert Flask template syntax to Django syntax"""
    
    # Convert {{ url_for('static', filename='...') }} to {% static '...' %}
    content = re.sub(
        r"{{\s*url_for\(['\"]static['\"]\s*,\s*filename=['\"]([^'\"]+)['\"]\s*\)\s*}}",
        r"{% static '\1' %}",
        content
    )
    
    # Add {% load static %} at the beginning if {% static %} is used and not already loaded
    if '{% static' in content and '{% load static %}' not in content:
        # Find the position after <!DOCTYPE html> or <html> tag
        if '<!DOCTYPE' in content:
            content = re.sub(
                r'(<!DOCTYPE[^>]*>\s*<html[^>]*>\s*<head[^>]*>)',
                r'\1\n{% load static %}',
                content,
                count=1
            )
        elif '<html' in content:
            content = re.sub(
                r'(<html[^>]*>\s*<head[^>]*>)',
                r'\1\n{% load static %}',
                content,
                count=1
            )
        else:
            # If no html tag, add at the very beginning
            content = '{% load static %}\n' + content
    
    return content

# Process all HTML files
for html_file in templates_dir.rglob("*.html"):
    print(f"Processing: {html_file}")
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content = convert_flask_to_django(content)
        
        if content != new_content:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"  ✓ Updated: {html_file.name}")
        else:
            print(f"  - No changes needed: {html_file.name}")
    except Exception as e:
        print(f"  ✗ Error processing {html_file.name}: {e}")

print("\nConversion complete!")

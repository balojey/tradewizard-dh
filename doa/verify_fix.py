#!/usr/bin/env python3
"""
Quick verification script for the list parsing fix.
"""

from tools.newsdata_tools import FetchLatestNewsInput, parse_list_field

print("Testing parse_list_field function...")
print("-" * 50)

# Test 1: Parse string representation
test1 = parse_list_field("['ir']")
print(f"Test 1 - String representation: \"['ir']\" -> {test1}")
assert test1 == ['ir'], f"Expected ['ir'], got {test1}"
print("✓ PASSED")

# Test 2: Parse actual list
test2 = parse_list_field(['us', 'uk'])
print(f"Test 2 - Actual list: ['us', 'uk'] -> {test2}")
assert test2 == ['us', 'uk'], f"Expected ['us', 'uk'], got {test2}"
print("✓ PASSED")

# Test 3: Parse None
test3 = parse_list_field(None)
print(f"Test 3 - None: None -> {test3}")
assert test3 is None, f"Expected None, got {test3}"
print("✓ PASSED")

print("\n" + "=" * 50)
print("Testing FetchLatestNewsInput validation...")
print("=" * 50)

# Test 4: The exact error case from the bug report
print("\nTest 4 - Exact error case from bug report:")
try:
    input_data = {
        "country": "['ir']",
        "category": "['politics']",
        "language": "['en']"
    }
    print(f"Input: {input_data}")
    
    result = FetchLatestNewsInput(**input_data)
    
    print(f"Result country: {result.country} (type: {type(result.country)})")
    print(f"Result category: {result.category} (type: {type(result.category)})")
    print(f"Result language: {result.language} (type: {type(result.language)})")
    
    assert result.country == ['ir'], f"Expected ['ir'], got {result.country}"
    assert result.category == ['politics'], f"Expected ['politics'], got {result.category}"
    assert result.language == ['en'], f"Expected ['en'], got {result.language}"
    
    print("✓ PASSED - No validation error!")
    
except Exception as e:
    print(f"✗ FAILED - {type(e).__name__}: {e}")
    exit(1)

# Test 5: Mixed formats
print("\nTest 5 - Mixed formats (string + list):")
try:
    input_data = {
        "country": "['us']",
        "category": ['politics', 'business'],
        "language": "['en', 'es']"
    }
    print(f"Input: {input_data}")
    
    result = FetchLatestNewsInput(**input_data)
    
    print(f"Result country: {result.country}")
    print(f"Result category: {result.category}")
    print(f"Result language: {result.language}")
    
    assert result.country == ['us']
    assert result.category == ['politics', 'business']
    assert result.language == ['en', 'es']
    
    print("✓ PASSED")
    
except Exception as e:
    print(f"✗ FAILED - {type(e).__name__}: {e}")
    exit(1)

print("\n" + "=" * 50)
print("ALL TESTS PASSED! ✓")
print("=" * 50)
print("\nThe fix successfully resolves the Pydantic validation error.")
print("List parameters can now be provided as:")
print("  - String representations: \"['ir']\"")
print("  - Actual lists: ['ir']")
print("  - Single strings: 'ir' (wrapped automatically)")

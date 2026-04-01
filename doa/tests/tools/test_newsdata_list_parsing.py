"""
Test list parameter parsing in NewsData tools.

This test verifies that list parameters (country, category, language, etc.)
are correctly parsed when provided as string representations by LangChain.

Requirements: Bug fix for Pydantic validation errors
"""

import pytest
from doa.tools.newsdata_tools import (
    FetchLatestNewsInput,
    FetchArchiveNewsInput,
    FetchCryptoNewsInput,
    FetchMarketNewsInput,
    parse_list_field
)


class TestParseListField:
    """Test the parse_list_field helper function."""
    
    def test_parse_none(self):
        """Should return None for None input."""
        assert parse_list_field(None) is None
    
    def test_parse_actual_list(self):
        """Should return the list unchanged if already a list."""
        input_list = ['us', 'uk', 'ca']
        assert parse_list_field(input_list) == input_list
    
    def test_parse_string_representation(self):
        """Should parse string representation of list."""
        assert parse_list_field("['us', 'uk']") == ['us', 'uk']
        assert parse_list_field("['politics']") == ['politics']
        assert parse_list_field("['en']") == ['en']
    
    def test_parse_single_string(self):
        """Should wrap single string value in list."""
        assert parse_list_field("us") == ["us"]
        assert parse_list_field("politics") == ["politics"]
    
    def test_parse_invalid_string(self):
        """Should wrap invalid string in list as fallback."""
        assert parse_list_field("not a list") == ["not a list"]


class TestFetchLatestNewsInput:
    """Test FetchLatestNewsInput validation with string representations."""
    
    def test_country_as_string_representation(self):
        """Should parse country when provided as string representation."""
        input_data = {
            "country": "['ir']",
            "category": "['politics']",
            "language": "['en']"
        }
        result = FetchLatestNewsInput(**input_data)
        assert result.country == ['ir']
        assert result.category == ['politics']
        assert result.language == ['en']
    
    def test_category_as_string_representation(self):
        """Should parse category when provided as string representation."""
        input_data = {
            "category": "['business', 'politics']",
            "language": "['en']"
        }
        result = FetchLatestNewsInput(**input_data)
        assert result.category == ['business', 'politics']
    
    def test_language_as_string_representation(self):
        """Should parse language when provided as string representation."""
        input_data = {
            "language": "['en', 'es']"
        }
        result = FetchLatestNewsInput(**input_data)
        assert result.language == ['en', 'es']
    
    def test_all_fields_as_actual_lists(self):
        """Should work normally with actual lists."""
        input_data = {
            "country": ['us', 'uk'],
            "category": ['politics'],
            "language": ['en']
        }
        result = FetchLatestNewsInput(**input_data)
        assert result.country == ['us', 'uk']
        assert result.category == ['politics']
        assert result.language == ['en']
    
    def test_mixed_formats(self):
        """Should handle mix of string representations and actual lists."""
        input_data = {
            "country": "['us']",
            "category": ['politics'],
            "language": "['en']"
        }
        result = FetchLatestNewsInput(**input_data)
        assert result.country == ['us']
        assert result.category == ['politics']
        assert result.language == ['en']


class TestFetchArchiveNewsInput:
    """Test FetchArchiveNewsInput validation with string representations."""
    
    def test_all_list_fields_as_strings(self):
        """Should parse all list fields when provided as string representations."""
        input_data = {
            "from_date": "2024-01-01",
            "to_date": "2024-01-31",
            "country": "['ir']",
            "category": "['politics']",
            "language": "['en']"
        }
        result = FetchArchiveNewsInput(**input_data)
        assert result.country == ['ir']
        assert result.category == ['politics']
        assert result.language == ['en']


class TestFetchCryptoNewsInput:
    """Test FetchCryptoNewsInput validation with string representations."""
    
    def test_coin_as_string_representation(self):
        """Should parse coin when provided as string representation."""
        input_data = {
            "coin": "['BTC', 'ETH']",
            "language": "['en']"
        }
        result = FetchCryptoNewsInput(**input_data)
        assert result.coin == ['BTC', 'ETH']
        assert result.language == ['en']
    
    def test_language_as_string_representation(self):
        """Should parse language when provided as string representation."""
        input_data = {
            "language": "['en', 'es']"
        }
        result = FetchCryptoNewsInput(**input_data)
        assert result.language == ['en', 'es']


class TestFetchMarketNewsInput:
    """Test FetchMarketNewsInput validation with string representations."""
    
    def test_symbol_as_string_representation(self):
        """Should parse symbol when provided as string representation."""
        input_data = {
            "symbol": "['AAPL', 'GOOGL']",
            "language": "['en']"
        }
        result = FetchMarketNewsInput(**input_data)
        assert result.symbol == ['AAPL', 'GOOGL']
        assert result.language == ['en']
    
    def test_organization_as_string_representation(self):
        """Should parse organization when provided as string representation."""
        input_data = {
            "organization": "['Apple', 'Google']",
            "language": "['en']"
        }
        result = FetchMarketNewsInput(**input_data)
        assert result.organization == ['Apple', 'Google']
        assert result.language == ['en']
    
    def test_all_list_fields_as_strings(self):
        """Should parse all list fields when provided as string representations."""
        input_data = {
            "symbol": "['AAPL']",
            "organization": "['Apple']",
            "country": "['us']",
            "language": "['en']"
        }
        result = FetchMarketNewsInput(**input_data)
        assert result.symbol == ['AAPL']
        assert result.organization == ['Apple']
        assert result.country == ['us']
        assert result.language == ['en']


class TestRealWorldScenario:
    """Test the exact error scenario from the bug report."""
    
    def test_exact_error_case(self):
        """Should handle the exact input that caused the original error."""
        # This is the exact input that was causing the validation error
        input_data = {
            "country": "['ir']",
            "category": "['politics']",
            "language": "['en']"
        }
        
        # This should not raise a validation error anymore
        result = FetchLatestNewsInput(**input_data)
        
        assert result.country == ['ir']
        assert result.category == ['politics']
        assert result.language == ['en']
        assert isinstance(result.country, list)
        assert isinstance(result.category, list)
        assert isinstance(result.language, list)

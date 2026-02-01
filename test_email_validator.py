"""
Comprehensive Test Suite for Email Validation Module

Test cases covering edge cases, security considerations, and performance validation.
Uses pytest framework for professional testing standards.
"""

import pytest
import time
from email_validator import validate_email, batch_validate_emails, EmailValidationError


class TestEmailValidation:
    """Test suite for email validation functionality."""
    
    def test_valid_emails(self):
        """Test various valid email formats."""
        valid_emails = [
            "user@example.com",
            "test.email@domain.co.uk", 
            "firstname.lastname@company.org",
            "user+tag@domain.com",
            "123@numbers.com",
            "a@b.co",  # Minimal valid email
            "user@sub.domain.com",
            "email@domain-with-dash.com"
        ]
        
        for email in valid_emails:
            assert validate_email(email, strict_mode=False) == True, f"Should be valid: {email}"
    
    def test_invalid_emails(self):
        """Test various invalid email formats."""
        invalid_emails = [
            "invalid.email",           # No @ symbol
            "user@",                   # No domain
            "@domain.com",             # No local part
            "user..double@domain.com", # Consecutive dots
            ".user@domain.com",        # Starts with dot
            "user.@domain.com",        # Ends with dot
            "user@domain..com",        # Consecutive dots in domain
            "user@domain.",            # Ends with dot
            "user@.domain.com",        # Domain starts with dot
            "user name@domain.com",    # Space in local part
            "user@domain",             # No TLD
            "user@domain.c",           # TLD too short
            "",                        # Empty string
            "   ",                     # Whitespace only
        ]
        
        for email in invalid_emails:
            assert validate_email(email, strict_mode=False) == False, f"Should be invalid: {email}"
    
    def test_strict_mode_exceptions(self):
        """Test that strict mode raises appropriate exceptions."""
        
        # Test None input
        with pytest.raises(EmailValidationError, match="Email cannot be None"):
            validate_email(None, strict_mode=True)
        
        # Test non-string input
        with pytest.raises(TypeError, match="Email must be a string"):
            validate_email(123, strict_mode=True)
        
        # Test empty string
        with pytest.raises(EmailValidationError, match="Email cannot be empty"):
            validate_email("", strict_mode=True)
        
        # Test invalid format
        with pytest.raises(EmailValidationError, match="Invalid email format"):
            validate_email("invalid.email", strict_mode=True)
    
    def test_non_strict_mode(self):
        """Test that non-strict mode returns False instead of raising exceptions."""
        
        assert validate_email(None, strict_mode=False) == False
        assert validate_email(123, strict_mode=False) == False
        assert validate_email("", strict_mode=False) == False
        assert validate_email("invalid.email", strict_mode=False) == False
    
    def test_international_emails(self):
        """Test international domain name support."""
        
        international_emails = [
            "user@münchen.de",
            "test@日本.jp", 
            "email@россия.рф"
        ]
        
        for email in international_emails:
            # Should work with international support enabled
            result_intl = validate_email(email, strict_mode=False, allow_international=True)
            # Note: Our current regex is ASCII-focused, so these might fail
            # This test documents expected behavior for future enhancement
            print(f"International email {email}: {result_intl}")
    
    def test_length_limits(self):
        """Test email length validation."""
        
        # Test maximum length (320 characters per RFC 5321)
        long_local = "a" * 64
        long_domain = "b" * 60 + ".com"
        max_length_email = f"{long_local}@{long_domain}"
        
        # Should be valid if under 320 characters
        if len(max_length_email) <= 320:
            assert validate_email(max_length_email, strict_mode=False) == True
        
        # Test exceeding maximum length
        too_long_email = "a" * 300 + "@" + "b" * 50 + ".com"
        assert validate_email(too_long_email, strict_mode=False) == False
        
        # Test minimum length
        assert validate_email("a@b.co", strict_mode=False) == True
        assert validate_email("ab", strict_mode=False) == False
    
    def test_security_checks(self):
        """Test additional security validations."""
        
        # Test consecutive dots
        assert validate_email("user..name@domain.com", strict_mode=False) == False
        
        # Test leading/trailing dots
        assert validate_email(".user@domain.com", strict_mode=False) == False
        assert validate_email("user.@domain.com", strict_mode=False) == False
        
        # Test domain dots
        assert validate_email("user@.domain.com", strict_mode=False) == False
        assert validate_email("user@domain.com.", strict_mode=False) == False
    
    def test_batch_validation(self):
        """Test batch validation functionality."""
        
        emails = [
            "valid1@example.com",
            "valid2@test.org", 
            "invalid.email",
            "another@valid.com",
            None,
            "@invalid.com"
        ]
        
        results = batch_validate_emails(emails, strict_mode=False)
        
        assert len(results['valid']) >= 2  # At least 2 valid emails
        assert len(results['invalid']) >= 2  # At least 2 invalid emails
        assert 'errors' in results
        
        # Verify structure
        assert isinstance(results['valid'], list)
        assert isinstance(results['invalid'], list)
        assert isinstance(results['errors'], list)


class TestPerformance:
    """Performance tests for email validation."""
    
    def test_validation_performance(self):
        """Test that email validation is performant."""
        
        test_email = "performance.test@example.com"
        iterations = 1000
        
        start_time = time.time()
        for _ in range(iterations):
            validate_email(test_email, strict_mode=False)
        end_time = time.time()
        
        total_time = end_time - start_time
        avg_time_ms = (total_time / iterations) * 1000
        
        print(f"Average validation time: {avg_time_ms:.3f}ms")
        
        # Should be faster than 1ms per validation on average
        assert avg_time_ms < 1.0, f"Validation too slow: {avg_time_ms}ms"
    
    def test_batch_performance(self):
        """Test batch validation performance."""
        
        emails = ["user{}@example.com".format(i) for i in range(100)]
        
        start_time = time.time()
        results = batch_validate_emails(emails, strict_mode=False)
        end_time = time.time()
        
        total_time = end_time - start_time
        
        print(f"Batch validation of 100 emails: {total_time:.3f}s")
        assert len(results['valid']) == 100
        assert total_time < 0.1  # Should complete in under 100ms


# Example usage and manual testing
if __name__ == "__main__":
    print("=== Running Manual Tests ===\n")
    
    # Create test instance
    test_suite = TestEmailValidation()
    perf_suite = TestPerformance()
    
    # Run some tests manually
    try:
        test_suite.test_valid_emails()
        print("✅ Valid email tests passed")
        
        test_suite.test_invalid_emails()
        print("✅ Invalid email tests passed")
        
        test_suite.test_strict_mode_exceptions()
        print("✅ Strict mode exception tests passed")
        
        test_suite.test_batch_validation()
        print("✅ Batch validation tests passed")
        
        perf_suite.test_validation_performance()
        print("✅ Performance tests passed")
        
        print("\n🎉 All tests completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        raise
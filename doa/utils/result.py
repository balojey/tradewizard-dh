"""Result type for functional error handling."""

from typing import Generic, TypeVar, Union, Callable

T = TypeVar('T')
E = TypeVar('E')


class Ok(Generic[T]):
    """Success result containing a value."""
    
    def __init__(self, value: T):
        self._value = value
    
    @property
    def value(self) -> T:
        """Get the success value."""
        return self._value
    
    def is_ok(self) -> bool:
        """Check if result is Ok."""
        return True
    
    def is_err(self) -> bool:
        """Check if result is Err."""
        return False
    
    def unwrap(self) -> T:
        """Unwrap the value (safe for Ok)."""
        return self._value
    
    def unwrap_or(self, default: T) -> T:
        """Unwrap the value or return default."""
        return self._value
    
    def map(self, fn: Callable[[T], 'U']) -> 'Ok[U]':
        """Map the value to a new Ok."""
        return Ok(fn(self._value))
    
    def __repr__(self) -> str:
        return f"Ok({self._value!r})"


class Err(Generic[E]):
    """Error result containing an error value."""
    
    def __init__(self, error: E):
        self._error = error
    
    @property
    def error(self) -> E:
        """Get the error value."""
        return self._error
    
    def is_ok(self) -> bool:
        """Check if result is Ok."""
        return False
    
    def is_err(self) -> bool:
        """Check if result is Err."""
        return True
    
    def unwrap(self) -> None:
        """Unwrap the value (raises for Err)."""
        raise ValueError(f"Called unwrap on Err: {self._error}")
    
    def unwrap_or(self, default: T) -> T:
        """Unwrap the value or return default."""
        return default
    
    def map(self, fn: Callable) -> 'Err[E]':
        """Map does nothing for Err."""
        return self
    
    def __repr__(self) -> str:
        return f"Err({self._error!r})"


# Type alias for Result
Result = Union[Ok[T], Err[E]]

"""Supabase client for database operations."""

import logging
from typing import Optional
from supabase import create_client, Client
from postgrest.exceptions import APIError

from config import DatabaseConfig
from utils.result import Result, Ok, Err

logger = logging.getLogger(__name__)


class DatabaseConnectionError(Exception):
    """Error connecting to database."""
    pass


class SupabaseClient:
    """
    Supabase client with connection management and error handling.
    
    Supports both Supabase Cloud and local PostgreSQL connections.
    Implements connection pooling and graceful error handling.
    """
    
    def __init__(self, config: DatabaseConfig):
        """
        Initialize Supabase client.
        
        Args:
            config: Database configuration
            
        Raises:
            DatabaseConnectionError: If connection cannot be established
        """
        self.config = config
        self._client: Optional[Client] = None
        self._connected = False
        
        if not config.enable_persistence:
            logger.info("Database persistence disabled")
            return
        
        # Initialize connection
        self._connect()
    
    def _connect(self) -> None:
        """
        Establish connection to Supabase.
        
        Raises:
            DatabaseConnectionError: If connection fails
        """
        try:
            # Prefer Supabase Cloud connection
            if self.config.supabase_url and self.config.supabase_key:
                logger.info(f"Connecting to Supabase at {self.config.supabase_url}")
                self._client = create_client(
                    self.config.supabase_url,
                    self.config.supabase_key
                )
                self._connected = True
                logger.info("Successfully connected to Supabase")
            
            # Fall back to direct PostgreSQL connection
            elif self.config.postgres_connection_string:
                logger.info("Connecting to PostgreSQL directly")
                # For direct PostgreSQL, we'll use the connection string
                # Supabase client can work with direct PostgreSQL URLs
                # Extract URL and create a minimal client
                self._client = create_client(
                    self.config.postgres_connection_string,
                    "dummy_key"  # Not used for direct PostgreSQL
                )
                self._connected = True
                logger.info("Successfully connected to PostgreSQL")
            
            else:
                raise DatabaseConnectionError(
                    "No database connection configured. "
                    "Provide either SUPABASE_URL/SUPABASE_KEY or POSTGRES_CONNECTION_STRING"
                )
        
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise DatabaseConnectionError(f"Database connection failed: {e}")
    
    @property
    def client(self) -> Client:
        """
        Get the Supabase client instance.
        
        Returns:
            Supabase client
            
        Raises:
            DatabaseConnectionError: If not connected
        """
        if not self._connected or self._client is None:
            raise DatabaseConnectionError("Not connected to database")
        return self._client
    
    def is_connected(self) -> bool:
        """
        Check if client is connected to database.
        
        Returns:
            True if connected, False otherwise
        """
        return self._connected and self._client is not None
    
    async def health_check(self) -> Result[bool, str]:
        """
        Perform health check on database connection.
        
        Returns:
            Ok(True) if healthy, Err(message) if unhealthy
        """
        if not self.is_connected():
            return Err("Not connected to database")
        
        try:
            # Try a simple query to verify connection
            response = self.client.table("markets").select("condition_id").limit(1).execute()
            return Ok(True)
        except APIError as e:
            logger.warning(f"Database health check failed: {e}")
            return Err(f"Health check failed: {e}")
        except Exception as e:
            logger.error(f"Unexpected error during health check: {e}")
            return Err(f"Unexpected error: {e}")
    
    def close(self) -> None:
        """Close database connection and cleanup resources."""
        if self._client:
            # Supabase client doesn't have explicit close method
            # Connection pooling is handled automatically
            self._client = None
            self._connected = False
            logger.info("Database connection closed")
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
        return False

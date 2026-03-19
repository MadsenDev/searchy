use std::{io, num::TryFromIntError};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] io::Error),
    #[error("walkdir error: {0}")]
    Walkdir(#[from] walkdir::Error),
    #[error("invalid numeric conversion: {0}")]
    IntConversion(#[from] TryFromIntError),
    #[error("{0}")]
    Message(String),
}

pub type AppResult<T> = Result<T, AppError>;

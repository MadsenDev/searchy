use std::path::Path;

use crate::core::{db, error::AppResult, state::SearchResult};

pub fn search(db_path: &Path, query: &str, max_results: usize, root: Option<&str>) -> AppResult<Vec<SearchResult>> {
    db::query_entries(db_path, query, max_results, root)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EntryTypeFilter {
    File,
    Folder,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum QueryFilter {
    Extension(String),
    ParentPath(String),
    FullPath(String),
    EntryType(EntryTypeFilter),
    Hidden(bool),
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ParsedQuery {
    pub terms: Vec<String>,
    pub phrases: Vec<String>,
    pub negated_terms: Vec<String>,
    pub negated_phrases: Vec<String>,
    pub filters: Vec<QueryFilter>,
    pub negated_filters: Vec<QueryFilter>,
    pub exact: bool,
}

impl ParsedQuery {
    pub fn search_terms(&self) -> Vec<String> {
        let mut terms = self.phrases.clone();
        terms.extend(self.terms.clone());
        terms
    }

    pub fn negated_search_terms(&self) -> Vec<String> {
        let mut terms = self.negated_phrases.clone();
        terms.extend(self.negated_terms.clone());
        terms
    }

    pub fn prefers_path_search(&self) -> bool {
        self.filters.iter().any(|filter| matches!(filter, QueryFilter::FullPath(_)))
            || self
                .negated_filters
                .iter()
                .any(|filter| matches!(filter, QueryFilter::FullPath(_)))
    }

    pub fn has_filters_only(&self) -> bool {
        self.search_terms().is_empty()
            && (!self.filters.is_empty() || !self.negated_filters.is_empty())
    }
}

pub fn parse_query(query: &str) -> ParsedQuery {
    let mut parsed = ParsedQuery::default();

    for raw_token in tokenize(query) {
        let token = raw_token.trim();
        if token.is_empty() {
            continue;
        }

        let negated = token.starts_with('!');
        let body = if negated { token[1..].trim() } else { token };
        if body.is_empty() {
            continue;
        }

        if let Some((key, value)) = body.split_once(':') {
            if let Some(kind) = parse_filter(key, value) {
                match kind {
                    ParsedPart::Filter(filter) => {
                        if negated {
                            parsed.negated_filters.push(filter);
                        } else {
                            parsed.filters.push(filter);
                        }
                    }
                    ParsedPart::Exact(flag) => {
                        if !negated {
                            parsed.exact = flag;
                        }
                    }
                }
                continue;
            }
        }

        let normalized = normalize_value(body);
        if normalized.is_empty() {
            continue;
        }

        if body.starts_with('"') && body.ends_with('"') {
            if negated {
                parsed.negated_phrases.push(normalized);
            } else {
                parsed.phrases.push(normalized);
            }
        } else if negated {
            parsed.negated_terms.push(normalized);
        } else {
            parsed.terms.push(normalized);
        }
    }

    parsed
}

enum ParsedPart {
    Filter(QueryFilter),
    Exact(bool),
}

fn parse_filter(key: &str, value: &str) -> Option<ParsedPart> {
    let normalized_key = key.trim().to_lowercase();
    let normalized_value = normalize_value(value);
    if normalized_value.is_empty() {
        return None;
    }

    match normalized_key.as_str() {
        "ext" => Some(ParsedPart::Filter(QueryFilter::Extension(
            normalized_value.trim_start_matches('.').to_string(),
        ))),
        "kind" => match normalized_value.as_str() {
            "file" => Some(ParsedPart::Filter(QueryFilter::EntryType(EntryTypeFilter::File))),
            "folder" | "dir" | "directory" => {
                Some(ParsedPart::Filter(QueryFilter::EntryType(EntryTypeFilter::Folder)))
            }
            _ => Some(ParsedPart::Filter(QueryFilter::Extension(
                normalized_value.trim_start_matches('.').to_string(),
            ))),
        },
        "in" | "under" => Some(ParsedPart::Filter(QueryFilter::ParentPath(normalized_value))),
        "path" => Some(ParsedPart::Filter(QueryFilter::FullPath(normalized_value))),
        "type" | "is" => match normalized_value.as_str() {
            "file" => Some(ParsedPart::Filter(QueryFilter::EntryType(EntryTypeFilter::File))),
            "folder" | "dir" | "directory" => {
                Some(ParsedPart::Filter(QueryFilter::EntryType(EntryTypeFilter::Folder)))
            }
            "hidden" => Some(ParsedPart::Filter(QueryFilter::Hidden(true))),
            "visible" => Some(ParsedPart::Filter(QueryFilter::Hidden(false))),
            _ => None,
        },
        "hidden" => parse_bool(&normalized_value)
            .map(|value| ParsedPart::Filter(QueryFilter::Hidden(value))),
        "exact" => parse_bool(&normalized_value).map(ParsedPart::Exact),
        _ => None,
    }
}

fn tokenize(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in query.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                current.push(ch);
            }
            c if c.is_whitespace() && !in_quotes => {
                if !current.trim().is_empty() {
                    tokens.push(current.trim().to_string());
                }
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    if !current.trim().is_empty() {
        tokens.push(current.trim().to_string());
    }

    tokens
}

fn normalize_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .split_whitespace()
        .map(|part| part.to_lowercase())
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_bool(value: &str) -> Option<bool> {
    match value {
        "true" | "1" | "yes" | "on" => Some(true),
        "false" | "0" | "no" | "off" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_query, EntryTypeFilter, QueryFilter};

    #[test]
    fn parses_terms_phrases_and_filters() {
        let parsed = parse_query(r#"report "annual plan" ext:pdf in:docs"#);
        assert_eq!(parsed.terms, vec!["report"]);
        assert_eq!(parsed.phrases, vec!["annual plan"]);
        assert_eq!(parsed.filters.len(), 2);
        assert_eq!(parsed.filters[0], QueryFilter::Extension("pdf".into()));
        assert_eq!(parsed.filters[1], QueryFilter::ParentPath("docs".into()));
    }

    #[test]
    fn parses_negated_filters_and_aliases() {
        let parsed = parse_query(r#"!ext:tmp is:folder under:archive"#);
        assert_eq!(parsed.negated_filters[0], QueryFilter::Extension("tmp".into()));
        assert_eq!(parsed.filters[0], QueryFilter::EntryType(EntryTypeFilter::Folder));
        assert_eq!(parsed.filters[1], QueryFilter::ParentPath("archive".into()));
    }

    #[test]
    fn unknown_and_malformed_filters_fall_back_to_terms() {
        let parsed = parse_query("mood:party ext:");
        assert_eq!(parsed.terms, vec!["mood:party", "ext:"]);
    }

    #[test]
    fn parses_exact_and_hidden_flags() {
        let parsed = parse_query(r#"exact:true hidden:false "foo bar""#);
        assert!(parsed.exact);
        assert_eq!(parsed.filters[0], QueryFilter::Hidden(false));
        assert_eq!(parsed.phrases, vec!["foo bar"]);
    }
}

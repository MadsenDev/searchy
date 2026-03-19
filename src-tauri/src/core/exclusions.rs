use std::path::Path;

use globset::{Glob, GlobMatcher};
use regex::Regex;

use crate::core::{
    error::{AppError, AppResult},
    state::ExcludeRule,
};

pub struct ExclusionMatcher {
    rules: Vec<CompiledRule>,
}

struct CompiledRule {
    rule: ExcludeRule,
    matcher: RuleMatcher,
}

enum RuleMatcher {
    Exact(String),
    Prefix(String),
    Glob(GlobMatcher),
    Regex(Regex),
}

impl ExclusionMatcher {
    pub fn new(rules: Vec<ExcludeRule>) -> AppResult<Self> {
        let mut compiled = Vec::new();

        for rule in rules.into_iter().filter(|rule| rule.enabled) {
            let matcher = match rule.rule_type.as_str() {
                "exact" => RuleMatcher::Exact(rule.pattern.clone()),
                "prefix" => RuleMatcher::Prefix(rule.pattern.clone()),
                "glob" => RuleMatcher::Glob(
                    Glob::new(&rule.pattern)
                        .map_err(|error| AppError::Message(format!("invalid glob '{}': {error}", rule.pattern)))?
                        .compile_matcher(),
                ),
                "regex" => RuleMatcher::Regex(
                    Regex::new(&rule.pattern)
                        .map_err(|error| AppError::Message(format!("invalid regex '{}': {error}", rule.pattern)))?,
                ),
                other => {
                    return Err(AppError::Message(format!(
                        "unsupported exclude rule type '{other}'"
                    )))
                }
            };

            compiled.push(CompiledRule { rule, matcher });
        }

        Ok(Self { rules: compiled })
    }

    pub fn is_excluded(&self, path: &Path, is_dir: bool) -> bool {
        let path_str = path.to_string_lossy();
        let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or_default();

        self.rules.iter().any(|rule| {
            if !applies_to(&rule.rule.applies_to, is_dir) {
                return false;
            }

            match &rule.matcher {
                RuleMatcher::Exact(pattern) => path_str == pattern.as_str() || file_name == pattern.as_str(),
                RuleMatcher::Prefix(pattern) => path_str.starts_with(pattern),
                RuleMatcher::Glob(matcher) => matcher.is_match(path) || matcher.is_match(file_name),
                RuleMatcher::Regex(regex) => regex.is_match(&path_str) || regex.is_match(file_name),
            }
        })
    }
}

fn applies_to(value: &str, is_dir: bool) -> bool {
    match value {
        "both" => true,
        "dir" => is_dir,
        "file" => !is_dir,
        _ => true,
    }
}

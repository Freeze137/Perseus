import type { Syntax } from '@perseus/contracts';

/**
 * Um pedaço de código inteiro e funcionando. Nunca um trecho.
 *
 * Os bancos de prosa prometem frase completa pelo mesmo motivo que aqui se
 * promete função completa: fragmento ensina ao dedo um formato que não existe.
 * O `code` é guardado exatamente como deve aparecer, indentação incluída,
 * porque a indentação faz parte do que está sendo digitado.
 */
export type Snippet = {
  readonly id: string;
  readonly syntax: Syntax;
  readonly code: string;
  /** Registro, mesma ideia das tags de frase: que tipo de código é este. */
  readonly tags: readonly string[];
};

/*
 * Todo snippet abaixo compila e roda sozinho: nenhum import omitido, nenhum
 * corpo trocado por comentário. A indentação segue o que o formatador de cada
 * linguagem produz, porque é o formato que o dedo vai encontrar num arquivo de
 * verdade: quatro espaços onde a comunidade escreve quatro, dois onde escreve
 * dois, e tab em Go porque o gofmt gera tab e digitar Go de outro jeito
 * treinaria um hábito que a toolchain desfaz.
 */
export const SNIPPETS: readonly Snippet[] = [
  {
    id: 'ts-001',
    syntax: 'typescript',
    tags: ['function'],
    code: `function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}`,
  },
  {
    id: 'ts-002',
    syntax: 'typescript',
    tags: ['collection'],
    code: `function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const bucket = groups.get(key(item)) ?? [];
    bucket.push(item);
    groups.set(key(item), bucket);
  }
  return groups;
}`,
  },
  {
    id: 'ts-003',
    syntax: 'typescript',
    tags: ['async'],
    code: `async function retry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}`,
  },
  {
    id: 'ts-004',
    syntax: 'typescript',
    tags: ['type'],
    code: `type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}`,
  },
  {
    id: 'ts-005',
    syntax: 'typescript',
    tags: ['string'],
    code: `export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}`,
  },
  {
    id: 'ts-006',
    syntax: 'typescript',
    tags: ['collection'],
    code: `function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}`,
  },
  {
    id: 'ts-007',
    syntax: 'typescript',
    tags: ['class'],
    code: `class Stack<T> {
  #items: T[] = [];

  push(item: T): void {
    this.#items.push(item);
  }

  pop(): T | undefined {
    return this.#items.pop();
  }

  get size(): number {
    return this.#items.length;
  }
}`,
  },
  {
    id: 'ts-008',
    syntax: 'typescript',
    tags: ['function'],
    code: `function memoize<A, R>(compute: (argument: A) => R): (argument: A) => R {
  const cache = new Map<A, R>();
  return (argument) => {
    const cached = cache.get(argument);
    if (cached !== undefined) return cached;
    const value = compute(argument);
    cache.set(argument, value);
    return value;
  };
}`,
  },
  {
    id: 'ts-009',
    syntax: 'typescript',
    tags: ['type'],
    code: `type Kind = 'circle' | 'square';

interface Shape {
  kind: Kind;
  size: number;
}

function area(shape: Shape): number {
  return shape.kind === 'circle'
    ? Math.PI * shape.size ** 2
    : shape.size ** 2;
}`,
  },
  {
    id: 'ts-010',
    syntax: 'typescript',
    tags: ['error'],
    code: `class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HttpError';
  }
}`,
  },
  {
    id: 'ts-011',
    syntax: 'typescript',
    tags: ['async'],
    code: `function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('timed out')), ms);
    }),
  ]);
}`,
  },
  {
    id: 'ts-012',
    syntax: 'typescript',
    tags: ['string'],
    code: `const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(unit === 0 ? 0 : 1) + ' ' + (UNITS[unit] ?? 'B');
}`,
  },
  {
    id: 'ts-013',
    syntax: 'typescript',
    tags: ['iterator'],
    code: `function zip<A, B>(left: readonly A[], right: readonly B[]): [A, B][] {
  const pairs: [A, B][] = [];
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a !== undefined && b !== undefined) pairs.push([a, b]);
  }
  return pairs;
}`,
  },
  {
    id: 'ts-014',
    syntax: 'typescript',
    tags: ['algorithm'],
    code: `function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}`,
  },
  {
    id: 'ts-015',
    syntax: 'typescript',
    tags: ['collection'],
    code: `function partition<T>(
  items: readonly T[],
  keep: (item: T) => boolean,
): [T[], T[]] {
  const kept: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (keep(item)) kept.push(item);
    else rest.push(item);
  }
  return [kept, rest];
}`,
  },
  {
    id: 'ts-016',
    syntax: 'typescript',
    tags: ['struct'],
    code: `interface Span {
  readonly from: number;
  readonly to: number;
}

function spanOf(a: number, b: number): Span {
  return Object.freeze({ from: Math.min(a, b), to: Math.max(a, b) });
}`,
  },
  {
    id: 'ts-017',
    syntax: 'typescript',
    tags: ['function'],
    code: `function pipe<T>(...steps: ((value: T) => T)[]): (value: T) => T {
  return (value) => steps.reduce((carried, step) => step(carried), value);
}`,
  },
  {
    id: 'ts-018',
    syntax: 'typescript',
    tags: ['async'],
    code: `function debounce<A extends unknown[]>(
  run: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => run(...args), ms);
  };
}`,
  },
  {
    id: 'ts-019',
    syntax: 'typescript',
    tags: ['collection'],
    code: `function countBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const id = key(item);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}`,
  },
  {
    id: 'ts-020',
    syntax: 'typescript',
    tags: ['algorithm'],
    code: `function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a !== undefined && b !== undefined) {
      copy[i] = b;
      copy[j] = a;
    }
  }
  return copy;
}`,
  },

  {
    id: 'py-001',
    syntax: 'python',
    tags: ['function'],
    code: `def clamp(value, low, high):
    return max(low, min(value, high))`,
  },
  {
    id: 'py-002',
    syntax: 'python',
    tags: ['collection'],
    code: `def group_by(items, key):
    groups = {}
    for item in items:
        groups.setdefault(key(item), []).append(item)
    return groups`,
  },
  {
    id: 'py-003',
    syntax: 'python',
    tags: ['algorithm'],
    code: `def binary_search(values, target):
    low, high = 0, len(values) - 1
    while low <= high:
        mid = (low + high) // 2
        if values[mid] == target:
            return mid
        if values[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1`,
  },
  {
    id: 'py-004',
    syntax: 'python',
    tags: ['io'],
    code: `from pathlib import Path


def read_lines(path):
    with Path(path).open(encoding="utf-8") as handle:
        return [line.rstrip("\\n") for line in handle]`,
  },
  {
    id: 'py-005',
    syntax: 'python',
    tags: ['class'],
    code: `class Counter:
    def __init__(self):
        self.counts = {}

    def add(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]`,
  },
  {
    id: 'py-006',
    syntax: 'python',
    tags: ['string'],
    code: `import re


def slugify(title):
    words = re.findall(r"[a-z0-9]+", title.lower())
    return "-".join(words)`,
  },
  {
    id: 'py-007',
    syntax: 'python',
    tags: ['iterator'],
    code: `def chunks(items, size):
    for start in range(0, len(items), size):
        yield items[start : start + size]`,
  },
  {
    id: 'py-008',
    syntax: 'python',
    tags: ['collection'],
    code: `def invert(mapping):
    return {value: key for key, value in mapping.items()}`,
  },
  {
    id: 'py-009',
    syntax: 'python',
    tags: ['algorithm'],
    code: `def quicksort(values):
    if len(values) <= 1:
        return values
    pivot = values[len(values) // 2]
    smaller = [value for value in values if value < pivot]
    equal = [value for value in values if value == pivot]
    larger = [value for value in values if value > pivot]
    return quicksort(smaller) + equal + quicksort(larger)`,
  },
  {
    id: 'py-010',
    syntax: 'python',
    tags: ['struct'],
    code: `from dataclasses import dataclass


@dataclass
class Point:
    x: float
    y: float

    def distance_to(self, other):
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5`,
  },
  {
    id: 'py-011',
    syntax: 'python',
    tags: ['error'],
    code: `class ParseError(Exception):
    pass


def parse_port(text):
    try:
        port = int(text)
    except ValueError:
        raise ParseError(f"not a number: {text}") from None
    if not 1 <= port <= 65535:
        raise ParseError(f"out of range: {port}")
    return port`,
  },
  {
    id: 'py-012',
    syntax: 'python',
    tags: ['async'],
    code: `import asyncio


async def fetch_all(urls, fetch):
    tasks = [asyncio.create_task(fetch(url)) for url in urls]
    return await asyncio.gather(*tasks)`,
  },
  {
    id: 'py-013',
    syntax: 'python',
    tags: ['function'],
    code: `import functools


def once(function):
    @functools.wraps(function)
    def wrapper(*args, **kwargs):
        if not hasattr(wrapper, "value"):
            wrapper.value = function(*args, **kwargs)
        return wrapper.value

    return wrapper`,
  },
  {
    id: 'py-014',
    syntax: 'python',
    tags: ['string'],
    code: `def format_duration(seconds):
    minutes, seconds = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"`,
  },
  {
    id: 'py-015',
    syntax: 'python',
    tags: ['collection'],
    code: `def top_by(items, score, count):
    ranked = sorted(items, key=score, reverse=True)
    return ranked[:count]`,
  },
  {
    id: 'py-016',
    syntax: 'python',
    tags: ['algorithm'],
    code: `from functools import lru_cache


@lru_cache(maxsize=None)
def fibonacci(index):
    if index < 2:
        return index
    return fibonacci(index - 1) + fibonacci(index - 2)`,
  },
  {
    id: 'py-017',
    syntax: 'python',
    tags: ['io'],
    code: `import json
from pathlib import Path


def load_config(path, default):
    file = Path(path)
    if not file.exists():
        return default
    return json.loads(file.read_text(encoding="utf-8"))`,
  },
  {
    id: 'py-018',
    syntax: 'python',
    tags: ['iterator'],
    code: `def moving_average(values, window):
    total = sum(values[:window])
    yield total / window
    for index in range(window, len(values)):
        total += values[index] - values[index - window]
        yield total / window`,
  },
  {
    id: 'py-019',
    syntax: 'python',
    tags: ['type'],
    code: `from typing import Iterable, Protocol


class Named(Protocol):
    name: str


def sort_by_name(items: Iterable[Named]) -> list[Named]:
    return sorted(items, key=lambda item: item.name)`,
  },
  {
    id: 'py-020',
    syntax: 'python',
    tags: ['collection'],
    code: `from collections import Counter


def most_common_words(text, count):
    words = text.lower().split()
    return Counter(words).most_common(count)`,
  },

  {
    id: 'rs-001',
    syntax: 'rust',
    tags: ['function'],
    code: `fn clamp(value: i32, low: i32, high: i32) -> i32 {
    value.max(low).min(high)
}`,
  },
  {
    id: 'rs-002',
    syntax: 'rust',
    tags: ['iterator'],
    code: `fn longest_word(text: &str) -> Option<&str> {
    text.split_whitespace().max_by_key(|word| word.len())
}`,
  },
  {
    id: 'rs-003',
    syntax: 'rust',
    tags: ['error'],
    code: `fn parse_port(raw: &str) -> Result<u16, String> {
    raw.trim()
        .parse::<u16>()
        .map_err(|error| format!("bad port {raw}: {error}"))
}`,
  },
  {
    id: 'rs-004',
    syntax: 'rust',
    tags: ['struct'],
    code: `#[derive(Debug, Clone, PartialEq)]
struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn distance(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}`,
  },
  {
    id: 'rs-005',
    syntax: 'rust',
    tags: ['collection'],
    code: `use std::collections::HashMap;

fn tally(words: &[&str]) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for word in words {
        *counts.entry(word.to_string()).or_insert(0) += 1;
    }
    counts
}`,
  },
  {
    id: 'rs-006',
    syntax: 'rust',
    tags: ['string'],
    code: `fn slugify(title: &str) -> String {
    let mut out = String::new();
    for symbol in title.to_lowercase().chars() {
        if symbol.is_alphanumeric() {
            out.push(symbol);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}`,
  },
  {
    id: 'rs-007',
    syntax: 'rust',
    tags: ['collection'],
    code: `use std::collections::HashSet;

fn unique(items: &[&str]) -> Vec<String> {
    let mut seen = HashSet::new();
    items
        .iter()
        .filter(|item| seen.insert(item.to_string()))
        .map(|item| item.to_string())
        .collect()
}`,
  },
  {
    id: 'rs-008',
    syntax: 'rust',
    tags: ['iterator'],
    code: `fn chunk<T: Clone>(items: &[T], size: usize) -> Vec<Vec<T>> {
    items.chunks(size).map(|group| group.to_vec()).collect()
}`,
  },
  {
    id: 'rs-009',
    syntax: 'rust',
    tags: ['algorithm'],
    code: `use std::cmp::Ordering;

fn index_of(values: &[i32], target: i32) -> Option<usize> {
    let mut low = 0;
    let mut high = values.len();
    while low < high {
        let mid = low + (high - low) / 2;
        match values[mid].cmp(&target) {
            Ordering::Equal => return Some(mid),
            Ordering::Less => low = mid + 1,
            Ordering::Greater => high = mid,
        }
    }
    None
}`,
  },
  {
    id: 'rs-010',
    syntax: 'rust',
    tags: ['type'],
    code: `enum Shape {
    Circle { radius: f64 },
    Square { side: f64 },
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { radius } => std::f64::consts::PI * radius * radius,
            Shape::Square { side } => side * side,
        }
    }
}`,
  },
  {
    id: 'rs-011',
    syntax: 'rust',
    tags: ['error'],
    code: `use std::fmt;

#[derive(Debug)]
struct ParseError {
    field: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(out, "could not parse {}", self.field)
    }
}

impl std::error::Error for ParseError {}`,
  },
  {
    id: 'rs-012',
    syntax: 'rust',
    tags: ['type'],
    code: `trait Named {
    fn name(&self) -> String;

    fn greeting(&self) -> String {
        format!("hello, {}", self.name())
    }
}

struct Player {
    handle: String,
}

impl Named for Player {
    fn name(&self) -> String {
        self.handle.clone()
    }
}`,
  },
  {
    id: 'rs-013',
    syntax: 'rust',
    tags: ['collection'],
    code: `use std::collections::HashMap;

fn by_length(words: &[&str]) -> HashMap<usize, Vec<String>> {
    let mut groups: HashMap<usize, Vec<String>> = HashMap::new();
    for word in words {
        groups.entry(word.len()).or_default().push(word.to_string());
    }
    groups
}`,
  },
  {
    id: 'rs-014',
    syntax: 'rust',
    tags: ['struct'],
    code: `use std::collections::HashMap;

struct Memo {
    cache: HashMap<u32, u64>,
}

impl Memo {
    fn new() -> Self {
        Memo {
            cache: HashMap::new(),
        }
    }

    fn factorial(&mut self, n: u32) -> u64 {
        if n < 2 {
            return 1;
        }
        if let Some(&value) = self.cache.get(&n) {
            return value;
        }
        let value = u64::from(n) * self.factorial(n - 1);
        self.cache.insert(n, value);
        value
    }
}`,
  },
  {
    id: 'rs-015',
    syntax: 'rust',
    tags: ['string'],
    code: `fn title_case(text: &str) -> String {
    text.split_whitespace()
        .map(|word| {
            let mut symbols = word.chars();
            match symbols.next() {
                Some(first) => {
                    first.to_uppercase().to_string() + &symbols.as_str().to_lowercase()
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}`,
  },
  {
    id: 'rs-016',
    syntax: 'rust',
    tags: ['algorithm'],
    code: `fn fibonacci(index: u32) -> u64 {
    let (mut previous, mut current) = (0u64, 1u64);
    for _ in 0..index {
        let next = previous + current;
        previous = current;
        current = next;
    }
    previous
}`,
  },
  {
    id: 'rs-017',
    syntax: 'rust',
    tags: ['function'],
    code: `fn initials(full_name: &str) -> Option<String> {
    let mut parts = full_name.split_whitespace();
    let first = parts.next()?.chars().next()?;
    let last = parts.last()?.chars().next()?;
    Some(format!("{first}.{last}."))
}`,
  },
  {
    id: 'rs-018',
    syntax: 'rust',
    tags: ['iterator'],
    code: `fn moving_average(values: &[f64], window: usize) -> Vec<f64> {
    values
        .windows(window)
        .map(|slice| slice.iter().sum::<f64>() / window as f64)
        .collect()
}`,
  },
  {
    id: 'rs-019',
    syntax: 'rust',
    tags: ['struct'],
    code: `#[derive(Debug, Default, PartialEq)]
struct Config {
    host: String,
    port: u16,
}

impl Config {
    fn host(mut self, host: &str) -> Self {
        self.host = host.to_string();
        self
    }

    fn port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }
}`,
  },
  {
    id: 'rs-020',
    syntax: 'rust',
    tags: ['collection'],
    code: `fn split_even(values: &[i32]) -> (Vec<i32>, Vec<i32>) {
    values.iter().copied().partition(|value| value % 2 == 0)
}`,
  },

  {
    id: 'go-001',
    syntax: 'go',
    tags: ['function'],
    code: `func Clamp(value, low, high int) int {
\tif value < low {
\t\treturn low
\t}
\tif value > high {
\t\treturn high
\t}
\treturn value
}`,
  },
  {
    id: 'go-002',
    syntax: 'go',
    tags: ['error'],
    code: `func ReadConfig(path string) ([]byte, error) {
\tdata, err := os.ReadFile(path)
\tif err != nil {
\t\treturn nil, fmt.Errorf("read config: %w", err)
\t}
\treturn data, nil
}`,
  },
  {
    id: 'go-003',
    syntax: 'go',
    tags: ['collection'],
    code: `func Tally(words []string) map[string]int {
\tcounts := make(map[string]int, len(words))
\tfor _, word := range words {
\t\tcounts[word]++
\t}
\treturn counts
}`,
  },
  {
    id: 'go-004',
    syntax: 'go',
    tags: ['concurrency'],
    code: `func FanIn(inputs ...<-chan int) <-chan int {
\tout := make(chan int)
\tvar wg sync.WaitGroup
\tfor _, input := range inputs {
\t\twg.Add(1)
\t\tgo func(c <-chan int) {
\t\t\tdefer wg.Done()
\t\t\tfor value := range c {
\t\t\t\tout <- value
\t\t\t}
\t\t}(input)
\t}
\tgo func() {
\t\twg.Wait()
\t\tclose(out)
\t}()
\treturn out
}`,
  },
  {
    id: 'go-005',
    syntax: 'go',
    tags: ['struct'],
    code: `type Point struct {
\tX, Y float64
}

func (p Point) Distance(q Point) float64 {
\treturn math.Hypot(p.X-q.X, p.Y-q.Y)
}`,
  },
  {
    id: 'go-006',
    syntax: 'go',
    tags: ['string'],
    code: `func Slugify(title string) string {
	var out []rune
	for _, symbol := range strings.ToLower(title) {
		switch {
		case unicode.IsLetter(symbol) || unicode.IsDigit(symbol):
			out = append(out, symbol)
		case len(out) > 0 && out[len(out)-1] != '-':
			out = append(out, '-')
		}
	}
	return strings.Trim(string(out), "-")
}`,
  },
  {
    id: 'go-007',
    syntax: 'go',
    tags: ['collection'],
    code: `func Unique(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		if _, found := seen[item]; found {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}`,
  },
  {
    id: 'go-008',
    syntax: 'go',
    tags: ['iterator'],
    code: `func Chunk[T any](items []T, size int) [][]T {
	var groups [][]T
	for start := 0; start < len(items); start += size {
		end := start + size
		if end > len(items) {
			end = len(items)
		}
		groups = append(groups, items[start:end])
	}
	return groups
}`,
  },
  {
    id: 'go-009',
    syntax: 'go',
    tags: ['algorithm'],
    code: `func BinarySearch(values []int, target int) int {
	low, high := 0, len(values)-1
	for low <= high {
		mid := low + (high-low)/2
		switch {
		case values[mid] == target:
			return mid
		case values[mid] < target:
			low = mid + 1
		default:
			high = mid - 1
		}
	}
	return -1
}`,
  },
  {
    id: 'go-010',
    syntax: 'go',
    tags: ['error'],
    code: `type PortError struct {
	Raw string
}

func (e *PortError) Error() string {
	return fmt.Sprintf("bad port %q", e.Raw)
}

func ParsePort(raw string) (int, error) {
	port, err := strconv.Atoi(raw)
	if err != nil || port < 1 || port > 65535 {
		return 0, &PortError{Raw: raw}
	}
	return port, nil
}`,
  },
  {
    id: 'go-011',
    syntax: 'go',
    tags: ['concurrency'],
    code: `func MapConcurrent(items []string, work func(string) string) []string {
	out := make([]string, len(items))
	var wg sync.WaitGroup
	for i, item := range items {
		wg.Add(1)
		go func(index int, value string) {
			defer wg.Done()
			out[index] = work(value)
		}(i, item)
	}
	wg.Wait()
	return out
}`,
  },
  {
    id: 'go-012',
    syntax: 'go',
    tags: ['function'],
    code: `func Memoize(compute func(int) int) func(int) int {
	var mu sync.Mutex
	cache := make(map[int]int)
	return func(key int) int {
		mu.Lock()
		defer mu.Unlock()
		if value, found := cache[key]; found {
			return value
		}
		value := compute(key)
		cache[key] = value
		return value
	}
}`,
  },
  {
    id: 'go-013',
    syntax: 'go',
    tags: ['collection'],
    code: `func LongestFirst(words []string) []string {
	out := make([]string, len(words))
	copy(out, words)
	sort.SliceStable(out, func(i, j int) bool {
		return len(out[i]) > len(out[j])
	})
	return out
}`,
  },
  {
    id: 'go-014',
    syntax: 'go',
    tags: ['struct'],
    code: `type Shape interface {
	Area() float64
}

type Circle struct {
	Radius float64
}

func (c Circle) Area() float64 {
	return math.Pi * c.Radius * c.Radius
}

func TotalArea(shapes []Shape) float64 {
	var total float64
	for _, shape := range shapes {
		total += shape.Area()
	}
	return total
}`,
  },
  {
    id: 'go-015',
    syntax: 'go',
    tags: ['string'],
    code: `func ReverseRunes(text string) string {
	runes := []rune(text)
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return string(runes)
}`,
  },
  {
    id: 'go-016',
    syntax: 'go',
    tags: ['algorithm'],
    code: `func Fibonacci(index int) int {
	previous, current := 0, 1
	for step := 0; step < index; step++ {
		previous, current = current, previous+current
	}
	return previous
}`,
  },
  {
    id: 'go-017',
    syntax: 'go',
    tags: ['io'],
    code: `func CountLines(reader io.Reader) (int, error) {
	scanner := bufio.NewScanner(reader)
	total := 0
	for scanner.Scan() {
		total++
	}
	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("count lines: %w", err)
	}
	return total, nil
}`,
  },
  {
    id: 'go-018',
    syntax: 'go',
    tags: ['collection'],
    code: `func Filter[T any](items []T, keep func(T) bool) []T {
	out := make([]T, 0, len(items))
	for _, item := range items {
		if keep(item) {
			out = append(out, item)
		}
	}
	return out
}`,
  },
  {
    id: 'go-019',
    syntax: 'go',
    tags: ['concurrency'],
    code: `func FirstResult(ctx context.Context, tasks []func() string) (string, error) {
	results := make(chan string, len(tasks))
	for _, task := range tasks {
		go func(run func() string) {
			results <- run()
		}(task)
	}
	select {
	case value := <-results:
		return value, nil
	case <-ctx.Done():
		return "", ctx.Err()
	}
}`,
  },
  {
    id: 'go-020',
    syntax: 'go',
    tags: ['type'],
    code: `type Number interface {
	~int | ~int64 | ~float64
}

func Sum[T Number](values []T) T {
	var total T
	for _, value := range values {
		total += value
	}
	return total
}`,
  },

  {
    id: 'sql-001',
    syntax: 'sql',
    tags: ['query'],
    code: `SELECT country, count(*) AS players
FROM results
WHERE completed_at >= now() - interval '30 days'
GROUP BY country
ORDER BY players DESC
LIMIT 10;`,
  },
  {
    id: 'sql-002',
    syntax: 'sql',
    tags: ['ddl'],
    code: `CREATE TABLE results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  wpm numeric(5, 2) NOT NULL,
  accuracy numeric(5, 2) NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);`,
  },
  {
    id: 'sql-003',
    syntax: 'sql',
    tags: ['join'],
    code: `SELECT u.username, max(r.wpm) AS best
FROM users AS u
JOIN results AS r ON r.user_id = u.id
GROUP BY u.username
HAVING count(r.id) >= 5
ORDER BY best DESC;`,
  },
  {
    id: 'sql-004',
    syntax: 'sql',
    tags: ['window'],
    code: `SELECT username,
       wpm,
       rank() OVER (ORDER BY wpm DESC) AS position
FROM leaderboard
WHERE accuracy >= 95;`,
  },
  {
    id: 'sql-005',
    syntax: 'sql',
    tags: ['cte'],
    code: `WITH recent AS (
  SELECT user_id, wpm
  FROM results
  WHERE completed_at > now() - interval '7 days'
)
SELECT user_id, round(avg(wpm), 1) AS average
FROM recent
GROUP BY user_id;`,
  },
  {
    id: 'sql-006',
    syntax: 'sql',
    tags: ['query'],
    code: `SELECT date_trunc('day', completed_at) AS day,
       count(*) AS runs,
       round(avg(wpm), 1) AS average
FROM results
GROUP BY day
ORDER BY day DESC;`,
  },
  {
    id: 'sql-007',
    syntax: 'sql',
    tags: ['join'],
    code: `SELECT u.username
FROM users AS u
LEFT JOIN results AS r ON r.user_id = u.id
WHERE r.id IS NULL
ORDER BY u.username;`,
  },
  {
    id: 'sql-008',
    syntax: 'sql',
    tags: ['window'],
    code: `SELECT completed_at,
       wpm,
       wpm - lag(wpm) OVER (ORDER BY completed_at) AS gained
FROM results
WHERE user_id = $1
ORDER BY completed_at;`,
  },
  {
    id: 'sql-009',
    syntax: 'sql',
    tags: ['cte'],
    code: `WITH RECURSIVE days AS (
  SELECT current_date - 6 AS day
  UNION ALL
  SELECT day + 1 FROM days WHERE day < current_date
)
SELECT days.day, count(r.id) AS runs
FROM days
LEFT JOIN results AS r ON r.completed_at::date = days.day
GROUP BY days.day
ORDER BY days.day;`,
  },
  {
    id: 'sql-010',
    syntax: 'sql',
    tags: ['ddl'],
    code: `CREATE INDEX results_recent_idx
  ON results (user_id, completed_at DESC)
  WHERE accuracy >= 90;`,
  },
  {
    id: 'sql-011',
    syntax: 'sql',
    tags: ['query'],
    code: `INSERT INTO leaderboard (username, wpm, accuracy)
VALUES ($1, $2, $3)
ON CONFLICT (username) DO UPDATE
  SET wpm = excluded.wpm,
      accuracy = excluded.accuracy
WHERE excluded.wpm > leaderboard.wpm;`,
  },
  {
    id: 'sql-012',
    syntax: 'sql',
    tags: ['query'],
    code: `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wpm) AS median,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY wpm) AS top_five
FROM results
WHERE completed_at >= now() - interval '30 days';`,
  },
  {
    id: 'sql-013',
    syntax: 'sql',
    tags: ['window'],
    code: `SELECT username, wpm
FROM (
  SELECT u.username,
         r.wpm,
         row_number() OVER (PARTITION BY u.id ORDER BY r.wpm DESC) AS seat
  FROM users AS u
  JOIN results AS r ON r.user_id = u.id
) AS ranked
WHERE seat = 1;`,
  },
  {
    id: 'sql-014',
    syntax: 'sql',
    tags: ['ddl'],
    code: `ALTER TABLE results
  ADD COLUMN consistency numeric(5, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT results_accuracy_range
    CHECK (accuracy >= 0 AND accuracy <= 100);`,
  },
  {
    id: 'sql-015',
    syntax: 'sql',
    tags: ['join'],
    code: `SELECT u.username, best.wpm
FROM users AS u
CROSS JOIN LATERAL (
  SELECT r.wpm
  FROM results AS r
  WHERE r.user_id = u.id
  ORDER BY r.wpm DESC
  LIMIT 3
) AS best
ORDER BY u.username, best.wpm DESC;`,
  },
  {
    id: 'sql-016',
    syntax: 'sql',
    tags: ['query'],
    code: `UPDATE results
SET accuracy = least(accuracy, 100)
WHERE accuracy > 100
RETURNING id, accuracy;`,
  },
  {
    id: 'sql-017',
    syntax: 'sql',
    tags: ['cte'],
    code: `WITH totals AS (
  SELECT user_id,
         count(*) AS runs,
         count(*) FILTER (WHERE accuracy >= 95) AS clean
  FROM results
  GROUP BY user_id
)
SELECT user_id, runs, clean
FROM totals
WHERE runs >= 3
ORDER BY clean DESC;`,
  },
  {
    id: 'sql-018',
    syntax: 'sql',
    tags: ['query'],
    code: `DELETE FROM results
WHERE id IN (
  SELECT id
  FROM results
  WHERE completed_at < now() - interval '1 year'
  LIMIT 1000
);`,
  },
  {
    id: 'sql-019',
    syntax: 'sql',
    tags: ['ddl'],
    code: `CREATE VIEW personal_best AS
SELECT user_id,
       max(wpm) AS wpm,
       max(accuracy) AS accuracy
FROM results
GROUP BY user_id;`,
  },
  {
    id: 'sql-020',
    syntax: 'sql',
    tags: ['query'],
    code: `SELECT u.username,
       jsonb_agg(
         jsonb_build_object('wpm', r.wpm, 'at', r.completed_at)
         ORDER BY r.completed_at DESC
       ) AS history
FROM users AS u
JOIN results AS r ON r.user_id = u.id
GROUP BY u.username;`,
  },

  {
    id: 'js-001',
    syntax: 'javascript',
    tags: ['collection'],
    code: `export function chunk(items, size) {
  const groups = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}`,
  },
  {
    id: 'js-002',
    syntax: 'javascript',
    tags: ['function'],
    code: `export function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}`,
  },
  {
    id: 'js-003',
    syntax: 'javascript',
    tags: ['async'],
    code: `async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('request failed: ' + response.status);
  }
  return response.json();
}`,
  },
  {
    id: 'js-004',
    syntax: 'javascript',
    tags: ['collection'],
    code: `function tally(words) {
  return words.reduce((counts, word) => {
    counts[word] = (counts[word] ?? 0) + 1;
    return counts;
  }, {});
}`,
  },
  {
    id: 'js-005',
    syntax: 'javascript',
    tags: ['iterator'],
    code: `function* range(start, stop, step = 1) {
  for (let value = start; value < stop; value += step) {
    yield value;
  }
}`,
  },
  {
    id: 'js-006',
    syntax: 'javascript',
    tags: ['collection'],
    code: `function unique(items) {
  return [...new Set(items)];
}`,
  },
  {
    id: 'js-007',
    syntax: 'javascript',
    tags: ['class'],
    code: `class Emitter {
  #listeners = new Map();

  on(event, handler) {
    const handlers = this.#listeners.get(event) ?? [];
    handlers.push(handler);
    this.#listeners.set(event, handlers);
  }

  emit(event, payload) {
    for (const handler of this.#listeners.get(event) ?? []) {
      handler(payload);
    }
  }
}`,
  },
  {
    id: 'js-008',
    syntax: 'javascript',
    tags: ['string'],
    code: `function formatRow(cells, width) {
  return cells.map((cell) => \`\${cell}\`.padEnd(width)).join(' | ').trimEnd();
}`,
  },
  {
    id: 'js-009',
    syntax: 'javascript',
    tags: ['async'],
    code: `async function settle(tasks) {
  const results = await Promise.allSettled(tasks);
  return {
    done: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    failed: results.filter((r) => r.status === 'rejected').length,
  };
}`,
  },
  {
    id: 'js-010',
    syntax: 'javascript',
    tags: ['algorithm'],
    code: `function binarySearch(values, target) {
  let low = 0;
  let high = values.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] === target) return mid;
    if (values[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}`,
  },
  {
    id: 'js-011',
    syntax: 'javascript',
    tags: ['function'],
    code: `function curry(fn) {
  return function collect(...args) {
    if (args.length >= fn.length) return fn(...args);
    return (...rest) => collect(...args, ...rest);
  };
}`,
  },
  {
    id: 'js-012',
    syntax: 'javascript',
    tags: ['collection'],
    code: `function flatten(items, depth = 1) {
  if (depth < 1) return [...items];
  return items.reduce(
    (out, item) =>
      Array.isArray(item) ? out.concat(flatten(item, depth - 1)) : [...out, item],
    [],
  );
}`,
  },
  {
    id: 'js-013',
    syntax: 'javascript',
    tags: ['error'],
    code: `class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}`,
  },
  {
    id: 'js-014',
    syntax: 'javascript',
    tags: ['io'],
    code: `function safeParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}`,
  },
  {
    id: 'js-015',
    syntax: 'javascript',
    tags: ['struct'],
    code: `function makeConfig(host, port) {
  return Object.freeze({
    host,
    port,
    get origin() {
      return \`http://\${host}:\${port}\`;
    },
  });
}`,
  },
  {
    id: 'js-016',
    syntax: 'javascript',
    tags: ['algorithm'],
    code: `function memoFib() {
  const cache = new Map([
    [0, 0],
    [1, 1],
  ]);
  return function fib(n) {
    if (cache.has(n)) return cache.get(n);
    const value = fib(n - 1) + fib(n - 2);
    cache.set(n, value);
    return value;
  };
}`,
  },
  {
    id: 'js-017',
    syntax: 'javascript',
    tags: ['collection'],
    code: `function sortBy(items, pick) {
  return [...items].sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    if (left < right) return -1;
    return left > right ? 1 : 0;
  });
}`,
  },
  {
    id: 'js-018',
    syntax: 'javascript',
    tags: ['iterator'],
    code: `async function collect(source) {
  const items = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}`,
  },
  {
    id: 'js-019',
    syntax: 'javascript',
    tags: ['string'],
    code: `function titleCase(text) {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}`,
  },
  {
    id: 'js-020',
    syntax: 'javascript',
    tags: ['function'],
    code: `function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  };
}`,
  },

  {
    id: 'java-001',
    syntax: 'java',
    tags: ['function'],
    code: `public static int clamp(int value, int low, int high) {
    return Math.max(low, Math.min(value, high));
}`,
  },
  {
    id: 'java-002',
    syntax: 'java',
    tags: ['collection'],
    code: `public static Map<String, Integer> tally(List<String> words) {
    Map<String, Integer> counts = new HashMap<>();
    for (String word : words) {
        counts.merge(word, 1, Integer::sum);
    }
    return counts;
}`,
  },
  {
    id: 'java-003',
    syntax: 'java',
    tags: ['algorithm'],
    code: `public static int binarySearch(int[] values, int target) {
    int low = 0;
    int high = values.length - 1;
    while (low <= high) {
        int mid = (low + high) >>> 1;
        if (values[mid] == target) return mid;
        if (values[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`,
  },
  {
    id: 'java-004',
    syntax: 'java',
    tags: ['class'],
    code: `public record Point(double x, double y) {
    double distanceTo(Point other) {
        return Math.hypot(x - other.x(), y - other.y());
    }
}`,
  },
  {
    id: 'java-005',
    syntax: 'java',
    tags: ['string'],
    code: `public static String slugify(String title) {
    String cleaned = title.toLowerCase().replaceAll("[^a-z0-9]+", "-");
    return cleaned.replaceAll("^-+|-+$", "");
}`,
  },
  {
    id: 'java-006',
    syntax: 'java',
    tags: ['collection'],
    code: `public static Map<Integer, List<String>> byLength(List<String> words) {
    return words.stream().collect(Collectors.groupingBy(String::length));
}`,
  },
  {
    id: 'java-007',
    syntax: 'java',
    tags: ['iterator'],
    code: `public static <T> List<List<T>> chunk(List<T> items, int size) {
    List<List<T>> groups = new ArrayList<>();
    for (int start = 0; start < items.size(); start += size) {
        groups.add(items.subList(start, Math.min(start + size, items.size())));
    }
    return groups;
}`,
  },
  {
    id: 'java-008',
    syntax: 'java',
    tags: ['function'],
    code: `public static <A, R> Function<A, R> memoize(Function<A, R> compute) {
    Map<A, R> cache = new ConcurrentHashMap<>();
    return argument -> cache.computeIfAbsent(argument, compute);
}`,
  },
  {
    id: 'java-009',
    syntax: 'java',
    tags: ['error'],
    code: `public static class ParseException extends RuntimeException {
    private final String field;

    public ParseException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String field() {
        return field;
    }
}`,
  },
  {
    id: 'java-010',
    syntax: 'java',
    tags: ['async'],
    code: `public static CompletableFuture<List<String>> fetchAll(List<String> keys) {
    List<CompletableFuture<String>> tasks = keys.stream()
            .map(key -> CompletableFuture.supplyAsync(key::toUpperCase))
            .toList();
    return CompletableFuture.allOf(tasks.toArray(new CompletableFuture[0]))
            .thenApply(ignored -> tasks.stream().map(CompletableFuture::join).toList());
}`,
  },
  {
    id: 'java-011',
    syntax: 'java',
    tags: ['type'],
    code: `public sealed interface Shape permits Circle, Square {}

public record Circle(double radius) implements Shape {}

public record Square(double side) implements Shape {}

public static double area(Shape shape) {
    return switch (shape) {
        case Circle c -> Math.PI * c.radius() * c.radius();
        case Square s -> s.side() * s.side();
    };
}`,
  },
  {
    id: 'java-012',
    syntax: 'java',
    tags: ['io'],
    code: `public static List<String> readLines(Path path) throws IOException {
    try (Stream<String> lines = Files.lines(path, StandardCharsets.UTF_8)) {
        return lines.toList();
    }
}`,
  },
  {
    id: 'java-013',
    syntax: 'java',
    tags: ['algorithm'],
    code: `public static int editDistance(String left, String right) {
    int[] previous = new int[right.length() + 1];
    for (int j = 0; j <= right.length(); j++) previous[j] = j;
    for (int i = 1; i <= left.length(); i++) {
        int[] current = new int[right.length() + 1];
        current[0] = i;
        for (int j = 1; j <= right.length(); j++) {
            int cost = left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1;
            current[j] = Math.min(
                    Math.min(current[j - 1] + 1, previous[j] + 1),
                    previous[j - 1] + cost);
        }
        previous = current;
    }
    return previous[right.length()];
}`,
  },
  {
    id: 'java-014',
    syntax: 'java',
    tags: ['struct'],
    code: `public record Port(int number) {
    public Port {
        if (number < 1 || number > 65535) {
            throw new IllegalArgumentException("out of range: " + number);
        }
    }
}`,
  },
  {
    id: 'java-015',
    syntax: 'java',
    tags: ['collection'],
    code: `public static <T> Map<Boolean, List<T>> partition(List<T> items, Predicate<T> keep) {
    return items.stream().collect(Collectors.partitioningBy(keep));
}`,
  },
  {
    id: 'java-016',
    syntax: 'java',
    tags: ['string'],
    code: `public static String formatDuration(long seconds) {
    long hours = seconds / 3600;
    long minutes = (seconds % 3600) / 60;
    return String.format("%02d:%02d:%02d", hours, minutes, seconds % 60);
}`,
  },
  {
    id: 'java-017',
    syntax: 'java',
    tags: ['class'],
    code: `public static class Counter<T> {
    private final Map<T, Integer> counts = new HashMap<>();

    public int add(T key) {
        return counts.merge(key, 1, Integer::sum);
    }

    public int get(T key) {
        return counts.getOrDefault(key, 0);
    }
}`,
  },
  {
    id: 'java-018',
    syntax: 'java',
    tags: ['collection'],
    code: `public static List<String> longestFirst(List<String> words) {
    return words.stream()
            .sorted(Comparator.comparingInt(String::length).reversed())
            .toList();
}`,
  },
  {
    id: 'java-019',
    syntax: 'java',
    tags: ['algorithm'],
    code: `public static long fibonacci(int index) {
    long previous = 0;
    long current = 1;
    for (int step = 0; step < index; step++) {
        long next = previous + current;
        previous = current;
        current = next;
    }
    return previous;
}`,
  },
  {
    id: 'java-020',
    syntax: 'java',
    tags: ['iterator'],
    code: `public static List<Integer> takeWhileBelow(List<Integer> values, int limit) {
    return values.stream().takeWhile(value -> value < limit).toList();
}`,
  },

  {
    id: 'c-001',
    syntax: 'c',
    tags: ['function'],
    code: `int clamp(int value, int low, int high) {
    if (value < low) return low;
    if (value > high) return high;
    return value;
}`,
  },
  {
    id: 'c-002',
    syntax: 'c',
    tags: ['string'],
    code: `size_t str_length(const char *text) {
    size_t length = 0;
    while (text[length] != '\\0') {
        length += 1;
    }
    return length;
}`,
  },
  {
    id: 'c-003',
    syntax: 'c',
    tags: ['string'],
    code: `void reverse(char *text, size_t length) {
    for (size_t i = 0; i < length / 2; i += 1) {
        char swap = text[i];
        text[i] = text[length - 1 - i];
        text[length - 1 - i] = swap;
    }
}`,
  },
  {
    id: 'c-004',
    syntax: 'c',
    tags: ['algorithm'],
    code: `int binary_search(const int *values, int count, int target) {
    int low = 0;
    int high = count - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (values[mid] == target) return mid;
        if (values[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`,
  },
  {
    id: 'c-005',
    syntax: 'c',
    tags: ['algorithm'],
    code: `int gcd(int a, int b) {
    while (b != 0) {
        int rest = a % b;
        a = b;
        b = rest;
    }
    return a < 0 ? -a : a;
}`,
  },
  {
    id: 'c-006',
    syntax: 'c',
    tags: ['function'],
    code: `void swap(int *left, int *right) {
    int carried = *left;
    *left = *right;
    *right = carried;
}`,
  },
  {
    id: 'c-007',
    syntax: 'c',
    tags: ['collection'],
    code: `int max_of(const int *values, size_t count) {
    int best = values[0];
    for (size_t i = 1; i < count; i += 1) {
        if (values[i] > best) best = values[i];
    }
    return best;
}`,
  },
  {
    id: 'c-008',
    syntax: 'c',
    tags: ['struct'],
    code: `struct point {
    double x;
    double y;
};

double distance(struct point a, struct point b) {
    double dx = a.x - b.x;
    double dy = a.y - b.y;
    return sqrt(dx * dx + dy * dy);
}`,
  },
  {
    id: 'c-009',
    syntax: 'c',
    tags: ['algorithm'],
    code: `void insertion_sort(int *values, size_t count) {
    for (size_t i = 1; i < count; i += 1) {
        int current = values[i];
        size_t j = i;
        while (j > 0 && values[j - 1] > current) {
            values[j] = values[j - 1];
            j -= 1;
        }
        values[j] = current;
    }
}`,
  },
  {
    id: 'c-010',
    syntax: 'c',
    tags: ['string'],
    code: `int is_palindrome(const char *text, size_t length) {
    for (size_t i = 0; i < length / 2; i += 1) {
        if (text[i] != text[length - 1 - i]) return 0;
    }
    return 1;
}`,
  },
  {
    id: 'c-011',
    syntax: 'c',
    tags: ['string'],
    code: `void to_upper(char *text) {
    for (size_t i = 0; text[i] != '\\0'; i += 1) {
        if (text[i] >= 'a' && text[i] <= 'z') {
            text[i] = (char)(text[i] - 'a' + 'A');
        }
    }
}`,
  },
  {
    id: 'c-012',
    syntax: 'c',
    tags: ['algorithm'],
    code: `unsigned long long factorial(unsigned int n) {
    unsigned long long total = 1;
    for (unsigned int step = 2; step <= n; step += 1) {
        total *= step;
    }
    return total;
}`,
  },
  {
    id: 'c-013',
    syntax: 'c',
    tags: ['collection'],
    code: `size_t count_of(const int *values, size_t count, int wanted) {
    size_t found = 0;
    for (size_t i = 0; i < count; i += 1) {
        if (values[i] == wanted) found += 1;
    }
    return found;
}`,
  },
  {
    id: 'c-014',
    syntax: 'c',
    tags: ['struct'],
    code: `struct node {
    int value;
    struct node *next;
};

struct node *push(struct node *head, int value) {
    struct node *fresh = malloc(sizeof(struct node));
    if (fresh == NULL) return head;
    fresh->value = value;
    fresh->next = head;
    return fresh;
}`,
  },
  {
    id: 'c-015',
    syntax: 'c',
    tags: ['error'],
    code: `int safe_divide(int numerator, int denominator, int *result) {
    if (denominator == 0) return 0;
    *result = numerator / denominator;
    return 1;
}`,
  },
  {
    id: 'c-016',
    syntax: 'c',
    tags: ['collection'],
    code: `void reverse_ints(int *values, size_t count) {
    for (size_t i = 0; i < count / 2; i += 1) {
        int carried = values[i];
        values[i] = values[count - 1 - i];
        values[count - 1 - i] = carried;
    }
}`,
  },
  {
    id: 'c-017',
    syntax: 'c',
    tags: ['string'],
    code: `size_t trim_end(char *text) {
    size_t length = strlen(text);
    while (length > 0 && isspace((unsigned char)text[length - 1])) {
        length -= 1;
    }
    text[length] = '\\0';
    return length;
}`,
  },
  {
    id: 'c-018',
    syntax: 'c',
    tags: ['algorithm'],
    code: `unsigned long fibonacci(unsigned int index) {
    unsigned long previous = 0;
    unsigned long current = 1;
    for (unsigned int step = 0; step < index; step += 1) {
        unsigned long next = previous + current;
        previous = current;
        current = next;
    }
    return previous;
}`,
  },
  {
    id: 'c-019',
    syntax: 'c',
    tags: ['io'],
    code: `int write_line(FILE *out, const char *text) {
    if (fputs(text, out) == EOF) return 0;
    return fputc('\\n', out) != EOF;
}`,
  },
  {
    id: 'c-020',
    syntax: 'c',
    tags: ['string'],
    code: `size_t copy_bounded(char *destination, const char *source, size_t room) {
    size_t written = 0;
    while (written + 1 < room && source[written] != '\\0') {
        destination[written] = source[written];
        written += 1;
    }
    if (room > 0) destination[written] = '\\0';
    return written;
}`,
  },

  {
    id: 'cpp-001',
    syntax: 'cpp',
    tags: ['algorithm'],
    code: `#include <algorithm>
#include <vector>

int median(std::vector<int> values) {
    std::sort(values.begin(), values.end());
    return values[values.size() / 2];
}`,
  },
  {
    id: 'cpp-002',
    syntax: 'cpp',
    tags: ['collection'],
    code: `std::unordered_map<std::string, int> tally(const std::vector<std::string> &words) {
    std::unordered_map<std::string, int> counts;
    for (const auto &word : words) {
        counts[word] += 1;
    }
    return counts;
}`,
  },
  {
    id: 'cpp-003',
    syntax: 'cpp',
    tags: ['struct'],
    code: `struct Point {
    double x;
    double y;

    double distance(const Point &other) const {
        return std::hypot(x - other.x, y - other.y);
    }
};`,
  },
  {
    id: 'cpp-004',
    syntax: 'cpp',
    tags: ['template'],
    code: `template <typename T>
const T &clamp(const T &value, const T &low, const T &high) {
    return value < low ? low : (high < value ? high : value);
}`,
  },
  {
    id: 'cpp-005',
    syntax: 'cpp',
    tags: ['string'],
    code: `std::string slugify(const std::string &title) {
    std::string out;
    for (unsigned char symbol : title) {
        if (std::isalnum(symbol)) {
            out.push_back(static_cast<char>(std::tolower(symbol)));
        } else if (!out.empty() && out.back() != '-') {
            out.push_back('-');
        }
    }
    while (!out.empty() && out.back() == '-') {
        out.pop_back();
    }
    return out;
}`,
  },
  {
    id: 'cpp-006',
    syntax: 'cpp',
    tags: ['collection'],
    code: `std::vector<std::string> unique(const std::vector<std::string> &items) {
    std::unordered_set<std::string> seen;
    std::vector<std::string> out;
    out.reserve(items.size());
    for (const auto &item : items) {
        if (seen.insert(item).second) {
            out.push_back(item);
        }
    }
    return out;
}`,
  },
  {
    id: 'cpp-007',
    syntax: 'cpp',
    tags: ['iterator'],
    code: `template <typename T>
std::vector<std::vector<T>> chunk(const std::vector<T> &items, std::size_t size) {
    std::vector<std::vector<T>> groups;
    for (std::size_t start = 0; start < items.size(); start += size) {
        const auto end = std::min(start + size, items.size());
        groups.emplace_back(items.begin() + static_cast<long>(start),
                            items.begin() + static_cast<long>(end));
    }
    return groups;
}`,
  },
  {
    id: 'cpp-008',
    syntax: 'cpp',
    tags: ['algorithm'],
    code: `std::optional<std::size_t> index_of(const std::vector<int> &values, int target) {
    std::size_t low = 0;
    std::size_t high = values.size();
    while (low < high) {
        const auto mid = low + (high - low) / 2;
        if (values[mid] == target) return mid;
        if (values[mid] < target) low = mid + 1;
        else high = mid;
    }
    return std::nullopt;
}`,
  },
  {
    id: 'cpp-009',
    syntax: 'cpp',
    tags: ['error'],
    code: `class ParseError : public std::runtime_error {
public:
    ParseError(std::string field, const std::string &message)
        : std::runtime_error(message), field_(std::move(field)) {}

    const std::string &field() const noexcept { return field_; }

private:
    std::string field_;
};`,
  },
  {
    id: 'cpp-010',
    syntax: 'cpp',
    tags: ['template'],
    code: `template <typename T>
concept Number = std::integral<T> || std::floating_point<T>;

template <Number T>
T sum(const std::vector<T> &values) {
    return std::accumulate(values.begin(), values.end(), T{});
}`,
  },
  {
    id: 'cpp-011',
    syntax: 'cpp',
    tags: ['struct'],
    code: `class Counter {
public:
    int add(const std::string &key) { return ++counts_[key]; }

    int get(const std::string &key) const {
        const auto found = counts_.find(key);
        return found == counts_.end() ? 0 : found->second;
    }

private:
    std::unordered_map<std::string, int> counts_;
};`,
  },
  {
    id: 'cpp-012',
    syntax: 'cpp',
    tags: ['function'],
    code: `std::function<long long(int)> memoized_factorial() {
    auto cache = std::make_shared<std::unordered_map<int, long long>>();
    return [cache](int n) {
        const auto found = cache->find(n);
        if (found != cache->end()) return found->second;
        long long total = 1;
        for (int step = 2; step <= n; ++step) {
            total *= step;
        }
        cache->emplace(n, total);
        return total;
    };
}`,
  },
  {
    id: 'cpp-013',
    syntax: 'cpp',
    tags: ['collection'],
    code: `template <typename T, typename Keep>
std::pair<std::vector<T>, std::vector<T>> split_by(const std::vector<T> &items,
                                                   Keep keep) {
    std::pair<std::vector<T>, std::vector<T>> split;
    for (const auto &item : items) {
        (keep(item) ? split.first : split.second).push_back(item);
    }
    return split;
}`,
  },
  {
    id: 'cpp-014',
    syntax: 'cpp',
    tags: ['string'],
    code: `std::string join(const std::vector<std::string> &parts, const std::string &glue) {
    std::ostringstream out;
    for (std::size_t i = 0; i < parts.size(); ++i) {
        if (i > 0) out << glue;
        out << parts[i];
    }
    return out.str();
}`,
  },
  {
    id: 'cpp-015',
    syntax: 'cpp',
    tags: ['algorithm'],
    code: `unsigned long long fibonacci(unsigned int index) {
    unsigned long long previous = 0;
    unsigned long long current = 1;
    for (unsigned int step = 0; step < index; ++step) {
        const auto next = previous + current;
        previous = current;
        current = next;
    }
    return previous;
}`,
  },
  {
    id: 'cpp-016',
    syntax: 'cpp',
    tags: ['type'],
    code: `std::optional<int> parse_port(const std::string &raw) {
    try {
        const auto port = std::stoi(raw);
        if (port < 1 || port > 65535) return std::nullopt;
        return port;
    } catch (const std::exception &) {
        return std::nullopt;
    }
}`,
  },
  {
    id: 'cpp-017',
    syntax: 'cpp',
    tags: ['iterator'],
    code: `std::vector<double> moving_average(const std::vector<double> &values,
                                   std::size_t window) {
    std::vector<double> out;
    if (values.size() < window || window == 0) return out;
    for (std::size_t start = 0; start + window <= values.size(); ++start) {
        const auto total = std::accumulate(values.begin() + static_cast<long>(start),
                                           values.begin() + static_cast<long>(start + window),
                                           0.0);
        out.push_back(total / static_cast<double>(window));
    }
    return out;
}`,
  },
  {
    id: 'cpp-018',
    syntax: 'cpp',
    tags: ['class'],
    code: `class Buffer {
public:
    explicit Buffer(std::size_t room) : data_(std::make_unique<char[]>(room)), room_(room) {}

    std::size_t write(const std::string &text) {
        const auto written = std::min(text.size(), room_);
        std::copy_n(text.begin(), written, data_.get());
        return written;
    }

    std::string read(std::size_t length) const {
        return std::string(data_.get(), std::min(length, room_));
    }

private:
    std::unique_ptr<char[]> data_;
    std::size_t room_;
};`,
  },
  {
    id: 'cpp-019',
    syntax: 'cpp',
    tags: ['collection'],
    code: `std::vector<std::string> longest_first(std::vector<std::string> words) {
    std::stable_sort(words.begin(), words.end(),
                     [](const std::string &a, const std::string &b) {
                         return a.size() > b.size();
                     });
    return words;
}`,
  },
  {
    id: 'cpp-020',
    syntax: 'cpp',
    tags: ['type'],
    code: `using Shape = std::variant<double, std::pair<double, double>>;

double area(const Shape &shape) {
    return std::visit(
        [](const auto &value) -> double {
            if constexpr (std::is_same_v<std::decay_t<decltype(value)>, double>) {
                return 3.14159265358979323846 * value * value;
            } else {
                return value.first * value.second;
            }
        },
        shape);
}`,
  },

  {
    id: 'cs-001',
    syntax: 'csharp',
    tags: ['function'],
    code: `public static int Clamp(int value, int low, int high)
{
    return Math.Max(low, Math.Min(value, high));
}`,
  },
  {
    id: 'cs-002',
    syntax: 'csharp',
    tags: ['collection'],
    code: `public static Dictionary<string, int> Tally(IEnumerable<string> words)
{
    var counts = new Dictionary<string, int>();
    foreach (var word in words)
    {
        counts[word] = counts.GetValueOrDefault(word) + 1;
    }
    return counts;
}`,
  },
  {
    id: 'cs-003',
    syntax: 'csharp',
    tags: ['async'],
    code: `public static async Task<string> ReadAllAsync(string path)
{
    using var reader = new StreamReader(path);
    return await reader.ReadToEndAsync();
}`,
  },
  {
    id: 'cs-004',
    syntax: 'csharp',
    tags: ['class'],
    code: `public record Point(double X, double Y)
{
    public double DistanceTo(Point other)
    {
        return Math.Sqrt(Math.Pow(X - other.X, 2) + Math.Pow(Y - other.Y, 2));
    }
}`,
  },
  {
    id: 'cs-005',
    syntax: 'csharp',
    tags: ['string'],
    code: `public static string Slugify(string title)
{
    var cleaned = new string(
        title.ToLowerInvariant().Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
    return string.Join("-", cleaned.Split('-', StringSplitOptions.RemoveEmptyEntries));
}`,
  },
  {
    id: 'cs-006',
    syntax: 'csharp',
    tags: ['collection'],
    code: `public static Dictionary<int, List<string>> ByLength(IEnumerable<string> words)
{
    return words
        .GroupBy(word => word.Length)
        .ToDictionary(group => group.Key, group => group.ToList());
}`,
  },
  {
    id: 'cs-007',
    syntax: 'csharp',
    tags: ['iterator'],
    code: `public static IEnumerable<List<T>> Chunk<T>(IEnumerable<T> items, int size)
{
    var group = new List<T>(size);
    foreach (var item in items)
    {
        group.Add(item);
        if (group.Count == size)
        {
            yield return group;
            group = new List<T>(size);
        }
    }
    if (group.Count > 0) yield return group;
}`,
  },
  {
    id: 'cs-008',
    syntax: 'csharp',
    tags: ['algorithm'],
    code: `public static int IndexOf(IReadOnlyList<int> values, int target)
{
    var low = 0;
    var high = values.Count - 1;
    while (low <= high)
    {
        var mid = low + (high - low) / 2;
        if (values[mid] == target) return mid;
        if (values[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`,
  },
  {
    id: 'cs-009',
    syntax: 'csharp',
    tags: ['error'],
    code: `public sealed class ParseException : Exception
{
    public ParseException(string field, string message) : base(message)
    {
        Field = field;
    }

    public string Field { get; }
}`,
  },
  {
    id: 'cs-010',
    syntax: 'csharp',
    tags: ['async'],
    code: `public static async Task<string[]> FetchAllAsync(IEnumerable<string> keys)
{
    var tasks = keys.Select(key => Task.Run(() => key.ToUpperInvariant()));
    return await Task.WhenAll(tasks);
}`,
  },
  {
    id: 'cs-011',
    syntax: 'csharp',
    tags: ['type'],
    code: `public abstract record Shape;

public sealed record Circle(double Radius) : Shape;

public sealed record Square(double Side) : Shape;

public static double Area(Shape shape) => shape switch
{
    Circle circle => Math.PI * circle.Radius * circle.Radius,
    Square square => square.Side * square.Side,
    _ => throw new ArgumentOutOfRangeException(nameof(shape)),
};`,
  },
  {
    id: 'cs-012',
    syntax: 'csharp',
    tags: ['function'],
    code: `public static Func<TIn, TOut> Memoize<TIn, TOut>(Func<TIn, TOut> compute)
    where TIn : notnull
{
    var cache = new Dictionary<TIn, TOut>();
    return argument =>
    {
        if (cache.TryGetValue(argument, out var cached)) return cached;
        var value = compute(argument);
        cache[argument] = value;
        return value;
    };
}`,
  },
  {
    id: 'cs-013',
    syntax: 'csharp',
    tags: ['collection'],
    code: `public static List<string> LongestFirst(IEnumerable<string> words)
{
    return words
        .OrderByDescending(word => word.Length)
        .ThenBy(word => word, StringComparer.Ordinal)
        .ToList();
}`,
  },
  {
    id: 'cs-014',
    syntax: 'csharp',
    tags: ['struct'],
    code: `public readonly struct Interval
{
    public Interval(int from, int to)
    {
        From = Math.Min(from, to);
        To = Math.Max(from, to);
    }

    public int From { get; }

    public int To { get; }

    public int Length => To - From;
}`,
  },
  {
    id: 'cs-015',
    syntax: 'csharp',
    tags: ['string'],
    code: `public static string FormatDuration(long seconds)
{
    var span = TimeSpan.FromSeconds(seconds);
    return $"{(int)span.TotalHours:D2}:{span.Minutes:D2}:{span.Seconds:D2}";
}`,
  },
  {
    id: 'cs-016',
    syntax: 'csharp',
    tags: ['algorithm'],
    code: `public static long Fibonacci(int index)
{
    long previous = 0;
    long current = 1;
    for (var step = 0; step < index; step++)
    {
        (previous, current) = (current, previous + current);
    }
    return previous;
}`,
  },
  {
    id: 'cs-017',
    syntax: 'csharp',
    tags: ['class'],
    code: `public sealed class Counter<T> where T : notnull
{
    private readonly Dictionary<T, int> _counts = new();

    public int Add(T key)
    {
        _counts[key] = _counts.GetValueOrDefault(key) + 1;
        return _counts[key];
    }

    public int Get(T key) => _counts.GetValueOrDefault(key);
}`,
  },
  {
    id: 'cs-018',
    syntax: 'csharp',
    tags: ['collection'],
    code: `public static (List<T> Kept, List<T> Dropped) Partition<T>(
    IEnumerable<T> items, Func<T, bool> keep)
{
    var kept = new List<T>();
    var dropped = new List<T>();
    foreach (var item in items)
    {
        (keep(item) ? kept : dropped).Add(item);
    }
    return (kept, dropped);
}`,
  },
  {
    id: 'cs-019',
    syntax: 'csharp',
    tags: ['io'],
    code: `public static List<string> ReadLines(TextReader reader)
{
    var lines = new List<string>();
    while (reader.ReadLine() is { } line)
    {
        lines.Add(line);
    }
    return lines;
}`,
  },
  {
    id: 'cs-020',
    syntax: 'csharp',
    tags: ['type'],
    code: `public static int ParsePort(string raw)
{
    if (!int.TryParse(raw, out var port) || port is < 1 or > 65535)
    {
        throw new ArgumentException($"out of range: {raw}", nameof(raw));
    }
    return port;
}`,
  },

  {
    id: 'rb-001',
    syntax: 'ruby',
    tags: ['function'],
    code: `def clamp(value, low, high)
  [[value, low].max, high].min
end`,
  },
  {
    id: 'rb-002',
    syntax: 'ruby',
    tags: ['collection'],
    code: `def tally(words)
  words.each_with_object(Hash.new(0)) do |word, counts|
    counts[word] += 1
  end
end`,
  },
  {
    id: 'rb-003',
    syntax: 'ruby',
    tags: ['class'],
    code: `class Counter
  def initialize
    @counts = Hash.new(0)
  end

  def add(key)
    @counts[key] += 1
  end
end`,
  },
  {
    id: 'rb-004',
    syntax: 'ruby',
    tags: ['string'],
    code: `def slugify(title)
  title.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\\A-|-\\z/, "")
end`,
  },
  {
    id: 'rb-005',
    syntax: 'ruby',
    tags: ['iterator'],
    code: `def chunk(items, size)
  items.each_slice(size).to_a
end`,
  },
  {
    id: 'rb-006',
    syntax: 'ruby',
    tags: ['collection'],
    code: `def by_length(words)
  words.group_by(&:length)
end`,
  },
  {
    id: 'rb-007',
    syntax: 'ruby',
    tags: ['algorithm'],
    code: `def index_of(values, target)
  low = 0
  high = values.length - 1
  while low <= high
    mid = low + (high - low) / 2
    return mid if values[mid] == target

    if values[mid] < target
      low = mid + 1
    else
      high = mid - 1
    end
  end
  nil
end`,
  },
  {
    id: 'rb-008',
    syntax: 'ruby',
    tags: ['error'],
    code: `class ParseError < StandardError
  attr_reader :field

  def initialize(field, message)
    super(message)
    @field = field
  end
end`,
  },
  {
    id: 'rb-009',
    syntax: 'ruby',
    tags: ['function'],
    code: `def memoize(&compute)
  cache = {}
  lambda do |argument|
    cache.fetch(argument) { cache[argument] = compute.call(argument) }
  end
end`,
  },
  {
    id: 'rb-010',
    syntax: 'ruby',
    tags: ['collection'],
    code: `def split_even(values)
  values.partition(&:even?)
end`,
  },
  {
    id: 'rb-011',
    syntax: 'ruby',
    tags: ['string'],
    code: `def title_case(text)
  text.split(" ").map { |word| word.downcase.capitalize }.join(" ")
end`,
  },
  {
    id: 'rb-012',
    syntax: 'ruby',
    tags: ['algorithm'],
    code: `def fibonacci(index)
  previous = 0
  current = 1
  index.times do
    previous, current = current, previous + current
  end
  previous
end`,
  },
  {
    id: 'rb-013',
    syntax: 'ruby',
    tags: ['iterator'],
    code: `def primes
  Enumerator.new do |yielder|
    found = []
    candidate = 2
    loop do
      if found.none? { |prime| (candidate % prime).zero? }
        found << candidate
        yielder << candidate
      end
      candidate += 1
    end
  end
end`,
  },
  {
    id: 'rb-014',
    syntax: 'ruby',
    tags: ['struct'],
    code: `Config = Struct.new(:host, :port) do
  def origin
    "http://#{host}:#{port}"
  end
end`,
  },
  {
    id: 'rb-015',
    syntax: 'ruby',
    tags: ['io'],
    code: `def read_lines(path)
  File.readlines(path, chomp: true)
end`,
  },
  {
    id: 'rb-016',
    syntax: 'ruby',
    tags: ['collection'],
    code: `def longest_first(words)
  words.sort_by { |word| [-word.length, word] }
end`,
  },
  {
    id: 'rb-017',
    syntax: 'ruby',
    tags: ['string'],
    code: `def format_duration(seconds)
  format("%02d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
end`,
  },
  {
    id: 'rb-018',
    syntax: 'ruby',
    tags: ['class'],
    code: `module Greetable
  def greeting
    "hello, #{name}"
  end
end

class Player
  include Greetable

  attr_reader :name

  def initialize(name)
    @name = name
  end
end`,
  },
  {
    id: 'rb-019',
    syntax: 'ruby',
    tags: ['type'],
    code: `def describe(shape)
  case shape
  in { kind: :circle, radius: Numeric => radius }
    Math::PI * radius * radius
  in { kind: :square, side: Numeric => side }
    side * side
  else
    raise ArgumentError, "unknown shape"
  end
end`,
  },
  {
    id: 'rb-020',
    syntax: 'ruby',
    tags: ['function'],
    code: `def retry_on(attempts:, wait: 0)
  tried = 0
  begin
    tried += 1
    yield tried
  rescue StandardError
    sleep(wait) if wait.positive?
    retry if tried < attempts
    raise
  end
end`,
  },

  {
    id: 'php-001',
    syntax: 'php',
    tags: ['function'],
    code: `function clamp(int $value, int $low, int $high): int
{
    return max($low, min($value, $high));
}`,
  },
  {
    id: 'php-002',
    syntax: 'php',
    tags: ['collection'],
    code: `function tally(array $words): array
{
    $counts = [];
    foreach ($words as $word) {
        $counts[$word] = ($counts[$word] ?? 0) + 1;
    }
    return $counts;
}`,
  },
  {
    id: 'php-003',
    syntax: 'php',
    tags: ['string'],
    code: `function slugify(string $title): string
{
    $slug = strtolower(trim($title));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    return trim($slug, '-');
}`,
  },
  {
    id: 'php-004',
    syntax: 'php',
    tags: ['class'],
    code: `final class Counter
{
    private array $counts = [];

    public function add(string $key): int
    {
        return $this->counts[$key] = ($this->counts[$key] ?? 0) + 1;
    }
}`,
  },
  {
    id: 'php-005',
    syntax: 'php',
    tags: ['collection'],
    code: `function unique(array $items): array
{
    $seen = [];
    $out = [];
    foreach ($items as $item) {
        if (isset($seen[$item])) {
            continue;
        }
        $seen[$item] = true;
        $out[] = $item;
    }
    return $out;
}`,
  },
  {
    id: 'php-006',
    syntax: 'php',
    tags: ['iterator'],
    code: `function chunk(array $items, int $size): iterable
{
    for ($start = 0; $start < count($items); $start += $size) {
        yield array_slice($items, $start, $size);
    }
}`,
  },
  {
    id: 'php-007',
    syntax: 'php',
    tags: ['algorithm'],
    code: `function indexOf(array $values, int $target): ?int
{
    $low = 0;
    $high = count($values) - 1;
    while ($low <= $high) {
        $mid = intdiv($low + $high, 2);
        if ($values[$mid] === $target) {
            return $mid;
        }
        if ($values[$mid] < $target) {
            $low = $mid + 1;
        } else {
            $high = $mid - 1;
        }
    }
    return null;
}`,
  },
  {
    id: 'php-008',
    syntax: 'php',
    tags: ['error'],
    code: `final class ParseException extends RuntimeException
{
    public function __construct(private readonly string $field, string $message)
    {
        parent::__construct($message);
    }

    public function field(): string
    {
        return $this->field;
    }
}`,
  },
  {
    id: 'php-009',
    syntax: 'php',
    tags: ['function'],
    code: `function memoize(callable $compute): callable
{
    $cache = [];
    return function (int $argument) use ($compute, &$cache): int {
        if (!array_key_exists($argument, $cache)) {
            $cache[$argument] = $compute($argument);
        }
        return $cache[$argument];
    };
}`,
  },
  {
    id: 'php-010',
    syntax: 'php',
    tags: ['collection'],
    code: `function partition(array $items, callable $keep): array
{
    $kept = [];
    $rest = [];
    foreach ($items as $item) {
        if ($keep($item)) {
            $kept[] = $item;
        } else {
            $rest[] = $item;
        }
    }
    return [$kept, $rest];
}`,
  },
  {
    id: 'php-011',
    syntax: 'php',
    tags: ['string'],
    code: `function titleCase(string $text): string
{
    return implode(' ', array_map(
        static fn (string $word): string => ucfirst(strtolower($word)),
        explode(' ', $text),
    ));
}`,
  },
  {
    id: 'php-012',
    syntax: 'php',
    tags: ['algorithm'],
    code: `function fibonacci(int $index): int
{
    $previous = 0;
    $current = 1;
    for ($step = 0; $step < $index; $step++) {
        [$previous, $current] = [$current, $previous + $current];
    }
    return $previous;
}`,
  },
  {
    id: 'php-013',
    syntax: 'php',
    tags: ['struct'],
    code: `final readonly class Config
{
    public function __construct(
        public string $host,
        public int $port,
    ) {
    }

    public function origin(): string
    {
        return "http://{$this->host}:{$this->port}";
    }
}`,
  },
  {
    id: 'php-014',
    syntax: 'php',
    tags: ['io'],
    code: `function readLines(string $path): array
{
    $lines = file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        throw new RuntimeException("could not read {$path}");
    }
    return $lines;
}`,
  },
  {
    id: 'php-015',
    syntax: 'php',
    tags: ['collection'],
    code: `function longestFirst(array $words): array
{
    usort($words, static function (string $a, string $b): int {
        return [strlen($b), $a] <=> [strlen($a), $b];
    });
    return $words;
}`,
  },
  {
    id: 'php-016',
    syntax: 'php',
    tags: ['string'],
    code: `function formatDuration(int $seconds): string
{
    return sprintf(
        '%02d:%02d:%02d',
        intdiv($seconds, 3600),
        intdiv($seconds % 3600, 60),
        $seconds % 60,
    );
}`,
  },
  {
    id: 'php-017',
    syntax: 'php',
    tags: ['class'],
    code: `interface Named
{
    public function name(): string;
}

final class Player implements Named
{
    public function __construct(private readonly string $handle)
    {
    }

    public function name(): string
    {
        return $this->handle;
    }
}`,
  },
  {
    id: 'php-018',
    syntax: 'php',
    tags: ['type'],
    code: `enum Level: string
{
    case Debug = 'debug';
    case Info = 'info';
    case Error = 'error';

    public function severity(): int
    {
        return match ($this) {
            Level::Debug => 10,
            Level::Info => 20,
            Level::Error => 40,
        };
    }
}`,
  },
  {
    id: 'php-019',
    syntax: 'php',
    tags: ['function'],
    code: `function parsePort(string $raw): int
{
    $port = filter_var($raw, FILTER_VALIDATE_INT);
    return match (true) {
        $port === false => throw new InvalidArgumentException("not a number: {$raw}"),
        $port < 1 || $port > 65535 => throw new InvalidArgumentException("out of range: {$port}"),
        default => $port,
    };
}`,
  },
  {
    id: 'php-020',
    syntax: 'php',
    tags: ['collection'],
    code: `function sumBy(array $items, callable $pick): int
{
    return array_reduce(
        $items,
        static fn (int $total, mixed $item): int => $total + $pick($item),
        0,
    );
}`,
  },

  {
    id: 'kt-001',
    syntax: 'kotlin',
    tags: ['function'],
    code: `fun clamp(value: Int, low: Int, high: Int): Int {
    return value.coerceIn(low, high)
}`,
  },
  {
    id: 'kt-002',
    syntax: 'kotlin',
    tags: ['collection'],
    code: `fun tally(words: List<String>): Map<String, Int> {
    val counts = mutableMapOf<String, Int>()
    for (word in words) {
        counts[word] = (counts[word] ?: 0) + 1
    }
    return counts
}`,
  },
  {
    id: 'kt-003',
    syntax: 'kotlin',
    tags: ['class'],
    code: `data class Point(val x: Double, val y: Double) {
    fun distanceTo(other: Point): Double =
        kotlin.math.hypot(x - other.x, y - other.y)
}`,
  },
  {
    id: 'kt-004',
    syntax: 'kotlin',
    tags: ['iterator'],
    code: `fun longestWord(text: String): String? =
    text.split(" ").filter { it.isNotBlank() }.maxByOrNull { it.length }`,
  },
  {
    id: 'kt-005',
    syntax: 'kotlin',
    tags: ['string'],
    code: `fun slugify(title: String): String =
    title.lowercase()
        .map { if (it.isLetterOrDigit()) it else '-' }
        .joinToString("")
        .split("-")
        .filter { it.isNotEmpty() }
        .joinToString("-")`,
  },
  {
    id: 'kt-006',
    syntax: 'kotlin',
    tags: ['collection'],
    code: `fun byLength(words: List<String>): Map<Int, List<String>> =
    words.groupBy { it.length }`,
  },
  {
    id: 'kt-007',
    syntax: 'kotlin',
    tags: ['iterator'],
    code: `fun <T> chunk(items: List<T>, size: Int): List<List<T>> =
    items.indices.step(size).map { start ->
        items.subList(start, minOf(start + size, items.size))
    }`,
  },
  {
    id: 'kt-008',
    syntax: 'kotlin',
    tags: ['algorithm'],
    code: `fun indexOf(values: List<Int>, target: Int): Int {
    var low = 0
    var high = values.size - 1
    while (low <= high) {
        val mid = low + (high - low) / 2
        when {
            values[mid] == target -> return mid
            values[mid] < target -> low = mid + 1
            else -> high = mid - 1
        }
    }
    return -1
}`,
  },
  {
    id: 'kt-009',
    syntax: 'kotlin',
    tags: ['error'],
    code: `class ParseException(val field: String, message: String) : Exception(message)

fun parsePort(raw: String): Int {
    val port = raw.toIntOrNull() ?: throw ParseException("port", "not a number: " + raw)
    if (port !in 1..65535) throw ParseException("port", "out of range: " + port)
    return port
}`,
  },
  {
    id: 'kt-010',
    syntax: 'kotlin',
    tags: ['type'],
    code: `sealed interface Shape {
    data class Circle(val radius: Double) : Shape

    data class Square(val side: Double) : Shape
}

fun area(shape: Shape): Double = when (shape) {
    is Shape.Circle -> Math.PI * shape.radius * shape.radius
    is Shape.Square -> shape.side * shape.side
}`,
  },
  {
    id: 'kt-011',
    syntax: 'kotlin',
    tags: ['function'],
    code: `fun <A, R> memoize(compute: (A) -> R): (A) -> R {
    val cache = mutableMapOf<A, R>()
    return { argument -> cache.getOrPut(argument) { compute(argument) } }
}`,
  },
  {
    id: 'kt-012',
    syntax: 'kotlin',
    tags: ['collection'],
    code: `fun <T> split(items: List<T>, keep: (T) -> Boolean): Pair<List<T>, List<T>> =
    items.partition(keep)`,
  },
  {
    id: 'kt-013',
    syntax: 'kotlin',
    tags: ['class'],
    code: `class Counter<T> {
    private val counts = mutableMapOf<T, Int>()

    fun add(key: T): Int {
        val next = (counts[key] ?: 0) + 1
        counts[key] = next
        return next
    }

    fun get(key: T): Int = counts[key] ?: 0
}`,
  },
  {
    id: 'kt-014',
    syntax: 'kotlin',
    tags: ['string'],
    code: `fun formatDuration(seconds: Long): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    return String.format("%02d:%02d:%02d", hours, minutes, seconds % 60)
}`,
  },
  {
    id: 'kt-015',
    syntax: 'kotlin',
    tags: ['algorithm'],
    code: `fun fibonacci(index: Int): Long {
    var previous = 0L
    var current = 1L
    repeat(index) {
        val next = previous + current
        previous = current
        current = next
    }
    return previous
}`,
  },
  {
    id: 'kt-016',
    syntax: 'kotlin',
    tags: ['struct'],
    code: `data class Config(val host: String = "localhost", val port: Int = 8080) {
    val origin: String
        get() = "http://" + host + ":" + port
}`,
  },
  {
    id: 'kt-017',
    syntax: 'kotlin',
    tags: ['iterator'],
    code: `fun primes(limit: Int): Sequence<Int> = sequence {
    val sieve = BooleanArray(limit + 1)
    for (candidate in 2..limit) {
        if (sieve[candidate]) continue
        yield(candidate)
        var multiple = candidate.toLong() * candidate
        while (multiple <= limit) {
            sieve[multiple.toInt()] = true
            multiple += candidate
        }
    }
}`,
  },
  {
    id: 'kt-018',
    syntax: 'kotlin',
    tags: ['collection'],
    code: `fun longestFirst(words: List<String>): List<String> =
    words.sortedWith(compareByDescending<String> { it.length }.thenBy { it })`,
  },
  {
    id: 'kt-019',
    syntax: 'kotlin',
    tags: ['type'],
    code: `fun String.titleCase(): String =
    split(" ").joinToString(" ") { word ->
        word.lowercase().replaceFirstChar { it.uppercase() }
    }`,
  },
  {
    id: 'kt-020',
    syntax: 'kotlin',
    tags: ['function'],
    code: `fun readPort(raw: String): Result<Int> = runCatching {
    val port = raw.trim().toInt()
    require(port in 1..65535) { "out of range: " + port }
    port
}`,
  },

  {
    id: 'sw-001',
    syntax: 'swift',
    tags: ['function'],
    code: `func clamp(_ value: Int, low: Int, high: Int) -> Int {
    return min(max(value, low), high)
}`,
  },
  {
    id: 'sw-002',
    syntax: 'swift',
    tags: ['collection'],
    code: `func tally(_ words: [String]) -> [String: Int] {
    var counts: [String: Int] = [:]
    for word in words {
        counts[word, default: 0] += 1
    }
    return counts
}`,
  },
  {
    id: 'sw-003',
    syntax: 'swift',
    tags: ['struct'],
    code: `struct Point {
    let x: Double
    let y: Double

    func distance(to other: Point) -> Double {
        return hypot(x - other.x, y - other.y)
    }
}`,
  },
  {
    id: 'sw-004',
    syntax: 'swift',
    tags: ['iterator'],
    code: `func longestWord(in text: String) -> String? {
    return text.split(separator: " ").map(String.init).max { $0.count < $1.count }
}`,
  },
  {
    id: 'sw-005',
    syntax: 'swift',
    tags: ['string'],
    code: `func slugify(_ title: String) -> String {
    let cleaned = title.lowercased().map { symbol -> Character in
        symbol.isLetter || symbol.isNumber ? symbol : "-"
    }
    return String(cleaned).split(separator: "-").joined(separator: "-")
}`,
  },
  {
    id: 'sw-006',
    syntax: 'swift',
    tags: ['collection'],
    code: `func unique(_ items: [String]) -> [String] {
    var seen = Set<String>()
    return items.filter { seen.insert($0).inserted }
}`,
  },
  {
    id: 'sw-007',
    syntax: 'swift',
    tags: ['iterator'],
    code: `func chunk<T>(_ items: [T], size: Int) -> [[T]] {
    return stride(from: 0, to: items.count, by: size).map { start in
        Array(items[start ..< min(start + size, items.count)])
    }
}`,
  },
  {
    id: 'sw-008',
    syntax: 'swift',
    tags: ['algorithm'],
    code: `func indexOf(_ values: [Int], target: Int) -> Int? {
    var low = 0
    var high = values.count - 1
    while low <= high {
        let mid = low + (high - low) / 2
        if values[mid] == target {
            return mid
        }
        if values[mid] < target {
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return nil
}`,
  },
  {
    id: 'sw-009',
    syntax: 'swift',
    tags: ['error'],
    code: `enum ParseError: Error, Equatable {
    case notANumber(String)
    case outOfRange(Int)
}

func parsePort(_ raw: String) throws -> Int {
    guard let port = Int(raw) else {
        throw ParseError.notANumber(raw)
    }
    guard (1 ... 65535).contains(port) else {
        throw ParseError.outOfRange(port)
    }
    return port
}`,
  },
  {
    id: 'sw-010',
    syntax: 'swift',
    tags: ['type'],
    code: `enum Shape {
    case circle(radius: Double)
    case square(side: Double)

    var area: Double {
        switch self {
        case let .circle(radius):
            return Double.pi * radius * radius
        case let .square(side):
            return side * side
        }
    }
}`,
  },
  {
    id: 'sw-011',
    syntax: 'swift',
    tags: ['function'],
    code: `func memoize<A: Hashable, R>(_ compute: @escaping (A) -> R) -> (A) -> R {
    var cache: [A: R] = [:]
    return { argument in
        if let cached = cache[argument] {
            return cached
        }
        let value = compute(argument)
        cache[argument] = value
        return value
    }
}`,
  },
  {
    id: 'sw-012',
    syntax: 'swift',
    tags: ['collection'],
    code: `func split<T>(_ items: [T], keep: (T) -> Bool) -> (kept: [T], rest: [T]) {
    var kept: [T] = []
    var rest: [T] = []
    for item in items {
        if keep(item) {
            kept.append(item)
        } else {
            rest.append(item)
        }
    }
    return (kept, rest)
}`,
  },
  {
    id: 'sw-013',
    syntax: 'swift',
    tags: ['class'],
    code: `final class Counter<T: Hashable> {
    private var counts: [T: Int] = [:]

    func add(_ key: T) -> Int {
        counts[key, default: 0] += 1
        return counts[key] ?? 0
    }

    func get(_ key: T) -> Int {
        return counts[key] ?? 0
    }
}`,
  },
  {
    id: 'sw-014',
    syntax: 'swift',
    tags: ['string'],
    code: `func formatDuration(_ seconds: Int) -> String {
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60
    return String(format: "%02d:%02d:%02d", hours, minutes, seconds % 60)
}`,
  },
  {
    id: 'sw-015',
    syntax: 'swift',
    tags: ['algorithm'],
    code: `func fibonacci(_ index: Int) -> Int {
    var previous = 0
    var current = 1
    for _ in 0 ..< index {
        (previous, current) = (current, previous + current)
    }
    return previous
}`,
  },
  {
    id: 'sw-016',
    syntax: 'swift',
    tags: ['struct'],
    code: `struct Config {
    let host: String
    let port: Int

    var origin: String {
        return "http://\\(host):\\(port)"
    }
}`,
  },
  {
    id: 'sw-017',
    syntax: 'swift',
    tags: ['iterator'],
    code: `func movingAverage(_ values: [Double], window: Int) -> [Double] {
    guard window > 0, values.count >= window else {
        return []
    }
    return (0 ... values.count - window).map { start in
        values[start ..< start + window].reduce(0, +) / Double(window)
    }
}`,
  },
  {
    id: 'sw-018',
    syntax: 'swift',
    tags: ['collection'],
    code: `func longestFirst(_ words: [String]) -> [String] {
    return words.sorted { left, right in
        left.count == right.count ? left < right : left.count > right.count
    }
}`,
  },
  {
    id: 'sw-019',
    syntax: 'swift',
    tags: ['type'],
    code: `protocol Named {
    var name: String { get }
}

extension Named {
    var greeting: String {
        return "hello, \\(name)"
    }
}

struct Player: Named {
    let name: String
}`,
  },
  {
    id: 'sw-020',
    syntax: 'swift',
    tags: ['function'],
    code: `func initials(of fullName: String) -> String? {
    let parts = fullName.split(separator: " ")
    guard let first = parts.first?.first, let last = parts.last?.first, parts.count > 1
    else {
        return nil
    }
    return "\\(first).\\(last)."
}`,
  },

  {
    id: 'sh-001',
    syntax: 'bash',
    tags: ['script'],
    code: `#!/usr/bin/env bash
set -euo pipefail

for file in *.log; do
  gzip --best "$file"
done`,
  },
  {
    id: 'sh-002',
    syntax: 'bash',
    tags: ['function'],
    code: `backup() {
  local source="$1"
  local target="$2"
  mkdir -p "$target"
  cp -a "$source" "$target/$(date +%F)"
}`,
  },
  {
    id: 'sh-003',
    syntax: 'bash',
    tags: ['function'],
    code: `retry() {
  local attempts="$1"
  shift
  for _ in $(seq 1 "$attempts"); do
    if "$@"; then
      return 0
    fi
    sleep 1
  done
  return 1
}`,
  },
  {
    id: 'sh-004',
    syntax: 'bash',
    tags: ['io'],
    code: `count_lines() {
  local total=0
  while IFS= read -r _; do
    total=$((total + 1))
  done < "$1"
  echo "$total"
}`,
  },
  {
    id: 'sh-005',
    syntax: 'bash',
    tags: ['function'],
    code: `require() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "missing: $name" >&2
    return 1
  fi
}`,
  },
  {
    id: 'sh-006',
    syntax: 'bash',
    tags: ['string'],
    code: `trim() {
  local text="$1"
  text="\${text#"\${text%%[![:space:]]*}"}"
  text="\${text%"\${text##*[![:space:]]}"}"
  printf '%s' "$text"
}`,
  },
  {
    id: 'sh-007',
    syntax: 'bash',
    tags: ['collection'],
    code: `join_by() {
  local separator="$1"
  shift
  local first="$1"
  shift
  printf '%s' "$first" "\${@/#/$separator}"
}`,
  },
  {
    id: 'sh-008',
    syntax: 'bash',
    tags: ['io'],
    code: `read_lines() {
  local -n target="$1"
  target=()
  while IFS= read -r line; do
    target+=("$line")
  done < "$2"
}`,
  },
  {
    id: 'sh-009',
    syntax: 'bash',
    tags: ['function'],
    code: `log() {
  local level="$1"
  shift
  printf '%s [%s] %s\\n' "$(date -u +%FT%TZ)" "$level" "$*" >&2
}`,
  },
  {
    id: 'sh-010',
    syntax: 'bash',
    tags: ['script'],
    code: `work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

printf 'building in %s\\n' "$work" > "$work/log"`,
  },
  {
    id: 'sh-011',
    syntax: 'bash',
    tags: ['collection'],
    code: `unique_lines() {
  local -A seen=()
  local line
  while IFS= read -r line; do
    if [[ -z "\${seen[$line]+set}" ]]; then
      seen[$line]=1
      printf '%s\\n' "$line"
    fi
  done
}`,
  },
  {
    id: 'sh-012',
    syntax: 'bash',
    tags: ['string'],
    code: `slugify() {
  local text="\${1,,}"
  text="\${text//[^a-z0-9]/-}"
  while [[ "$text" == *--* ]]; do
    text="\${text//--/-}"
  done
  text="\${text#-}"
  printf '%s' "\${text%-}"
}`,
  },
  {
    id: 'sh-013',
    syntax: 'bash',
    tags: ['io'],
    code: `write_atomic() {
  local target="$1"
  local temp
  temp="$(mktemp "\${target}.XXXXXX")"
  cat > "$temp"
  mv -f "$temp" "$target"
}`,
  },
  {
    id: 'sh-014',
    syntax: 'bash',
    tags: ['collection'],
    code: `sum_column() {
  local total=0
  local value
  while read -r value _; do
    total=$((total + value))
  done
  echo "$total"
}`,
  },
  {
    id: 'sh-015',
    syntax: 'bash',
    tags: ['function'],
    code: `wait_for() {
  local deadline=$((SECONDS + $1))
  shift
  while (( SECONDS < deadline )); do
    if "$@"; then
      return 0
    fi
    sleep 1
  done
  return 1
}`,
  },
  {
    id: 'sh-016',
    syntax: 'bash',
    tags: ['io'],
    code: `newest_in() {
  local newest=""
  local file
  for file in "$1"/*; do
    if [[ -f "$file" && ( -z "$newest" || "$file" -nt "$newest" ) ]]; then
      newest="$file"
    fi
  done
  printf '%s' "$newest"
}`,
  },
  {
    id: 'sh-017',
    syntax: 'bash',
    tags: ['function'],
    code: `count_matches() {
  local pattern="$1"
  local file="$2"
  grep -c -- "$pattern" "$file" || true
}`,
  },
  {
    id: 'sh-018',
    syntax: 'bash',
    tags: ['script'],
    code: `usage() {
  cat <<'HELP'
usage: deploy [--dry-run] TARGET

  --dry-run  print the plan and stop
  -h         show this help
HELP
}`,
  },
  {
    id: 'sh-019',
    syntax: 'bash',
    tags: ['function'],
    code: `parse_flags() {
  dry_run=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) dry_run=1 ;;
      --) shift; break ;;
      *) break ;;
    esac
    shift
  done
  rest=("$@")
}`,
  },
  {
    id: 'sh-020',
    syntax: 'bash',
    tags: ['collection'],
    code: `largest_of() {
  local best="$1"
  shift
  local value
  for value in "$@"; do
    if (( value > best )); then
      best="$value"
    fi
  done
  printf '%s' "$best"
}`,
  },
];

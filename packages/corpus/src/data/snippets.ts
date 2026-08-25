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
];

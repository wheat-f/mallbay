import { Injectable } from "@nestjs/common";

type Labels = Record<string, string>;
const MAX_LATENCY_SAMPLES = 1024;

export type MetricsSnapshot = {
  generatedAt: string;
  counters: Array<{ name: string; labels: Labels; value: number }>;
  latencies: Array<{
    name: string;
    labels: Labels;
    count: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    maxMs: number | null;
  }>;
};

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly latencies = new Map<string, number[]>();
  private readonly definitions = new Map<string, { name: string; labels: Labels }>();

  increment(name: string, labels: Labels = {}, value = 1) {
    const key = metricKey(name, labels);
    this.remember(key, name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  recordLatency(name: string, valueMs: number, labels: Labels = {}) {
    const key = metricKey(name, labels);
    this.remember(key, name, labels);
    const samples = this.latencies.get(key) ?? [];
    samples.push(valueMs);
    if (samples.length > MAX_LATENCY_SAMPLES) samples.splice(0, samples.length - MAX_LATENCY_SAMPLES);
    this.latencies.set(key, samples);
  }

  getCounter(name: string, labels: Labels = {}) {
    return this.counters.get(metricKey(name, labels)) ?? 0;
  }

  getLatencies(name: string, labels: Labels = {}) {
    return [...(this.latencies.get(metricKey(name, labels)) ?? [])];
  }

  snapshot(): MetricsSnapshot {
    const counters = [...this.counters.entries()].map(([key, value]) => ({
      ...(this.definitions.get(key) ?? fallbackDefinition(key)),
      value
    }));
    const latencies = [...this.latencies.entries()].map(([key, samples]) => {
      const sorted = [...samples].sort((a, b) => a - b);
      return {
        ...(this.definitions.get(key) ?? fallbackDefinition(key)),
        count: sorted.length,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        maxMs: sorted.at(-1) ?? null
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      counters: counters.sort(compareMetric),
      latencies: latencies.sort(compareMetric)
    };
  }

  private remember(key: string, name: string, labels: Labels) {
    if (!this.definitions.has(key)) this.definitions.set(key, { name, labels: { ...labels } });
  }
}

function metricKey(name: string, labels: Labels) {
  const normalizedLabels = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");

  return normalizedLabels ? `${name}{${normalizedLabels}}` : name;
}

function fallbackDefinition(key: string) {
  const brace = key.indexOf("{");
  return brace < 0 ? { name: key, labels: {} } : { name: key.slice(0, brace), labels: {} };
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? null;
}

function compareMetric(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

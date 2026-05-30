import { Injectable } from "@nestjs/common";

type Labels = Record<string, string>;

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly latencies = new Map<string, number[]>();

  increment(name: string, labels: Labels = {}, value = 1) {
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  recordLatency(name: string, valueMs: number, labels: Labels = {}) {
    const key = metricKey(name, labels);
    const samples = this.latencies.get(key) ?? [];
    samples.push(valueMs);
    this.latencies.set(key, samples);
  }

  getCounter(name: string, labels: Labels = {}) {
    return this.counters.get(metricKey(name, labels)) ?? 0;
  }

  getLatencies(name: string, labels: Labels = {}) {
    return [...(this.latencies.get(metricKey(name, labels)) ?? [])];
  }
}

function metricKey(name: string, labels: Labels) {
  const normalizedLabels = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");

  return normalizedLabels ? `${name}{${normalizedLabels}}` : name;
}

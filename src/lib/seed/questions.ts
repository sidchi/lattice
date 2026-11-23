import type { CompanySeed, QuestionSeed } from "./schema";

/**
 * Companies used for filter tags. Tags mark questions that fit a company's domain or
 * well-known engineering problems; they are illustrative, not reports of real interviews.
 */
export const companies: readonly CompanySeed[] = [
  { slug: "airbnb", name: "Airbnb" },
  { slug: "amazon", name: "Amazon" },
  { slug: "cloudflare", name: "Cloudflare" },
  { slug: "datadog", name: "Datadog" },
  { slug: "google", name: "Google" },
  { slug: "meta", name: "Meta" },
  { slug: "microsoft", name: "Microsoft" },
  { slug: "netflix", name: "Netflix" },
  { slug: "shopify", name: "Shopify" },
  { slug: "stripe", name: "Stripe" },
  { slug: "uber", name: "Uber" },
];

const systemDesign: readonly QuestionSeed[] = [
  {
    slug: "design-url-shortener",
    title: "Design a URL shortener",
    prompt:
      "Design a service like a link shortener that turns long URLs into short codes and redirects at high read volume. Cover the API, key generation, storage, caching, and how you would handle custom aliases and expiry.",
    category: "SYSTEM_DESIGN",
    difficulty: "EASY",
    companies: ["google", "amazon"],
  },
  {
    slug: "design-rate-limiter",
    title: "Design a distributed rate limiter",
    prompt:
      "Design a rate limiter that enforces per-API-key limits across a fleet of stateless API servers. Compare token bucket, leaky bucket and sliding window, and explain behaviour when the shared store is slow or unavailable.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["stripe", "cloudflare"],
  },
  {
    slug: "design-payment-idempotency",
    title: "Design idempotent payment APIs",
    prompt:
      "Clients retry charge requests on timeouts. Design the API and storage so a retried request never double-charges, including concurrent retries, partial failures between your service and the card processor, and key expiry.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["stripe", "shopify"],
  },
  {
    slug: "design-news-feed",
    title: "Design a social news feed",
    prompt:
      "Design the home feed for a social network with hundreds of millions of daily users. Discuss fan-out on write versus read, ranking, handling accounts with huge follower counts, and pagination.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["meta"],
  },
  {
    slug: "design-chat-system",
    title: "Design a chat system",
    prompt:
      "Design one-to-one and group messaging with delivery receipts and online presence. Cover connection management, message ordering, offline delivery and storage of message history.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["meta", "microsoft"],
  },
  {
    slug: "design-ride-matching",
    title: "Design ride matching",
    prompt:
      "Design the service that matches riders to nearby drivers in real time. Explain how you index driver locations, handle frequent location updates, and avoid assigning one driver to two riders.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["uber"],
  },
  {
    slug: "design-video-streaming",
    title: "Design a video streaming platform",
    prompt:
      "Design upload, transcoding and playback for a video streaming service. Cover adaptive bitrate, CDN strategy, and how you would measure and improve start-up time.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["netflix", "google"],
  },
  {
    slug: "design-notification-service",
    title: "Design a notification service",
    prompt:
      "Design a service that sends email, SMS and push notifications on behalf of other teams. Cover templating, user preferences, retries, deduplication and per-channel rate limits.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["amazon", "airbnb"],
  },
  {
    slug: "design-metrics-pipeline",
    title: "Design a metrics ingestion pipeline",
    prompt:
      "Design a system that ingests millions of time-series data points per second from agents and serves dashboards and alerts. Discuss storage layout, downsampling, cardinality limits and query latency.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["datadog"],
  },
  {
    slug: "design-key-value-store",
    title: "Design a distributed key-value store",
    prompt:
      "Design a horizontally scalable key-value store. Cover partitioning, replication, consistency choices, failure detection and how a client finds the right node.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["amazon", "google"],
  },
  {
    slug: "design-web-crawler",
    title: "Design a web crawler",
    prompt:
      "Design a crawler that fetches a billion pages a month. Cover the URL frontier, politeness per host, deduplication of content, and how you would recrawl pages that change often.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["google"],
  },
  {
    slug: "design-booking-system",
    title: "Design a booking and reservation system",
    prompt:
      "Design reservations for a lodging marketplace where two guests must never book the same nights. Cover availability search, holds during checkout, and reconciliation with external calendars.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["airbnb"],
  },
  {
    slug: "design-subscription-billing",
    title: "Design subscription billing",
    prompt:
      "Design recurring billing for a SaaS product with monthly and annual plans, upgrades mid-cycle, failed-payment retries and dunning emails. Explain proration and how you keep invoices auditable.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["stripe", "shopify"],
  },
  {
    slug: "design-search-autocomplete",
    title: "Design search autocomplete",
    prompt:
      "Design type-ahead suggestions for a search box that must respond in under 100 ms. Cover the data structure, how suggestions are ranked and refreshed, and personalisation.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["google", "amazon"],
  },
  {
    slug: "design-distributed-cache",
    title: "Design a distributed cache",
    prompt:
      "Design a caching tier in front of a database. Discuss consistent hashing, eviction, cache stampedes, invalidation on writes, and what happens when a cache node fails.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["meta", "cloudflare"],
  },
  {
    slug: "design-job-scheduler",
    title: "Design a distributed job scheduler",
    prompt:
      "Design a scheduler that runs millions of delayed and recurring jobs with at-least-once execution. Cover leasing, retries with backoff, and preventing a job from running twice concurrently.",
    category: "SYSTEM_DESIGN",
    difficulty: "HARD",
    companies: ["uber", "microsoft"],
  },
  {
    slug: "design-file-sync",
    title: "Design a file sync service",
    prompt:
      "Design a service that keeps a folder in sync across a user's devices. Cover chunking, deduplication, conflict resolution, and syncing efficiently over slow connections.",
    category: "SYSTEM_DESIGN",
    difficulty: "MEDIUM",
    companies: ["microsoft", "google"],
  },
];

const behavioral: readonly QuestionSeed[] = [
  {
    slug: "tell-me-about-yourself",
    title: "Tell me about yourself",
    prompt:
      "Give a two-minute overview of your background that explains why you are interested in this role. Focus on the experience most relevant to the job.",
    category: "BEHAVIORAL",
    difficulty: "EASY",
    companies: [],
  },
  {
    slug: "disagreed-with-manager",
    title: "Disagreeing with your manager",
    prompt:
      "Tell me about a time you disagreed with your manager on a technical or product decision. How did you raise it, and what happened?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["amazon", "meta"],
  },
  {
    slug: "production-incident",
    title: "Handling a production incident",
    prompt:
      "Describe a serious production incident you were involved in. What was your role during the incident, how was it resolved, and what changed afterwards?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["datadog", "cloudflare"],
  },
  {
    slug: "missed-deadline",
    title: "Missing a deadline",
    prompt:
      "Tell me about a project that slipped past its deadline. When did you realise it was at risk, how did you communicate it, and what would you do differently?",
    category: "BEHAVIORAL",
    difficulty: "EASY",
    companies: ["microsoft"],
  },
  {
    slug: "influence-without-authority",
    title: "Influencing without authority",
    prompt:
      "Describe a time you got another team to change their plans or adopt your approach when you had no authority over them.",
    category: "BEHAVIORAL",
    difficulty: "HARD",
    companies: ["google", "stripe"],
  },
  {
    slug: "biggest-technical-mistake",
    title: "Your biggest technical mistake",
    prompt:
      "What is the most significant technical mistake you have made? How did you discover it, how did you fix it, and what did you learn?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["netflix"],
  },
  {
    slug: "mentoring-engineer",
    title: "Mentoring another engineer",
    prompt:
      "Tell me about an engineer you helped grow. What did they need, what did you do, and how did you know it worked?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["shopify", "airbnb"],
  },
  {
    slug: "ambiguous-requirements",
    title: "Working with ambiguous requirements",
    prompt:
      "Describe a project that started with unclear or changing requirements. How did you reduce the ambiguity and decide what to build first?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["amazon", "uber"],
  },
  {
    slug: "pushed-back-on-scope",
    title: "Pushing back on scope",
    prompt:
      "Tell me about a time you pushed back on a request from product or leadership. What was the trade-off and how did you make the case?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["meta"],
  },
  {
    slug: "difficult-teammate",
    title: "Working with a difficult teammate",
    prompt:
      "Describe a time you had friction with a teammate. What caused it, what did you do about it, and where did the relationship end up?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["microsoft", "google"],
  },
  {
    slug: "technical-debt-tradeoff",
    title: "Paying down technical debt",
    prompt:
      "Tell me about a time you argued for paying down technical debt instead of building features. How did you quantify the cost and get buy-in?",
    category: "BEHAVIORAL",
    difficulty: "HARD",
    companies: ["shopify", "stripe"],
  },
  {
    slug: "customer-obsession",
    title: "Going beyond for a customer",
    prompt:
      "Describe a time you went well beyond your normal scope to solve a customer's problem. How did you balance it against your other commitments?",
    category: "BEHAVIORAL",
    difficulty: "EASY",
    companies: ["amazon"],
  },
  {
    slug: "data-driven-decision",
    title: "Making a data-driven decision",
    prompt:
      "Tell me about a decision you made using data that contradicted the team's intuition. What did the data show and how did you convince people?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["netflix", "airbnb"],
  },
  {
    slug: "led-cross-team-project",
    title: "Leading a cross-team project",
    prompt:
      "Describe the largest project you have led that spanned multiple teams. How did you plan it, track it, and keep the teams aligned?",
    category: "BEHAVIORAL",
    difficulty: "HARD",
    companies: ["google", "uber"],
  },
  {
    slug: "learned-new-technology",
    title: "Learning something new fast",
    prompt:
      "Tell me about a time you had to become productive in an unfamiliar language, system or domain quickly. How did you approach it?",
    category: "BEHAVIORAL",
    difficulty: "EASY",
    companies: ["datadog"],
  },
  {
    slug: "received-hard-feedback",
    title: "Receiving hard feedback",
    prompt:
      "Describe the most difficult piece of feedback you have received. How did you react at first, and what did you change?",
    category: "BEHAVIORAL",
    difficulty: "MEDIUM",
    companies: ["meta", "netflix"],
  },
  {
    slug: "why-this-company",
    title: "Why this company?",
    prompt:
      "Why do you want to work here, and why now? Connect your answer to what the team builds and to your own goals.",
    category: "BEHAVIORAL",
    difficulty: "EASY",
    companies: [],
  },
];

const coding: readonly QuestionSeed[] = [
  {
    slug: "two-sum",
    title: "Two sum",
    prompt:
      "Given an array of integers and a target, return the indices of the two numbers that add up to the target. Aim for better than quadratic time and explain the trade-off you make.",
    category: "CODING",
    difficulty: "EASY",
    companies: ["amazon", "google"],
  },
  {
    slug: "valid-parentheses",
    title: "Valid parentheses",
    prompt:
      "Given a string containing only the characters ()[]{}, decide whether the brackets are balanced and correctly nested.",
    category: "CODING",
    difficulty: "EASY",
    companies: ["meta"],
  },
  {
    slug: "merge-intervals",
    title: "Merge intervals",
    prompt:
      "Given a list of closed intervals, merge all overlapping intervals and return the result sorted by start.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["google", "airbnb"],
  },
  {
    slug: "lru-cache",
    title: "LRU cache",
    prompt:
      "Implement a least-recently-used cache with get and put in O(1) time. Explain how you would make it safe for concurrent use.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["amazon", "microsoft"],
  },
  {
    slug: "number-of-islands",
    title: "Number of islands",
    prompt:
      "Given a grid of '1' (land) and '0' (water), count the islands. Land cells connect horizontally and vertically.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["amazon", "uber"],
  },
  {
    slug: "top-k-frequent",
    title: "Top K frequent elements",
    prompt:
      "Return the k most frequent elements of an array. Compare a heap-based solution with bucket sort.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["meta", "datadog"],
  },
  {
    slug: "course-schedule",
    title: "Course schedule",
    prompt:
      "Given a number of courses and prerequisite pairs, decide whether all courses can be finished, and return a valid order if so.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["google"],
  },
  {
    slug: "longest-substring-no-repeat",
    title: "Longest substring without repeating characters",
    prompt: "Find the length of the longest substring of a string that has no repeated characters.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["amazon", "microsoft"],
  },
  {
    slug: "merge-k-sorted-lists",
    title: "Merge k sorted lists",
    prompt:
      "Merge k sorted linked lists into one sorted list. Analyse the time complexity of your approach in terms of n total nodes and k lists.",
    category: "CODING",
    difficulty: "HARD",
    companies: ["google", "netflix"],
  },
  {
    slug: "serialize-binary-tree",
    title: "Serialize and deserialize a binary tree",
    prompt:
      "Design functions that convert a binary tree to a string and back. The format is yours to choose; justify it.",
    category: "CODING",
    difficulty: "HARD",
    companies: ["meta", "microsoft"],
  },
  {
    slug: "word-ladder",
    title: "Word ladder",
    prompt:
      "Given a start word, an end word and a dictionary, find the length of the shortest transformation sequence that changes one letter at a time.",
    category: "CODING",
    difficulty: "HARD",
    companies: ["amazon"],
  },
  {
    slug: "sliding-window-maximum",
    title: "Sliding window maximum",
    prompt: "Return the maximum of every contiguous window of size k in an array, in linear time.",
    category: "CODING",
    difficulty: "HARD",
    companies: ["google", "datadog"],
  },
  {
    slug: "rate-limiter-class",
    title: "Implement a rate limiter",
    prompt:
      "Implement a class that allows at most N requests per rolling window per client ID and reports whether each request is allowed. Discuss memory use with many clients.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["stripe", "cloudflare"],
  },
  {
    slug: "parse-csv-ledger",
    title: "Reconcile a transaction ledger",
    prompt:
      "Given two lists of transactions (id, amount in cents, currency) from an internal ledger and a processor report, return the missing, extra and mismatched entries.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["stripe", "shopify"],
  },
  {
    slug: "meeting-rooms",
    title: "Minimum meeting rooms",
    prompt:
      "Given meeting time intervals, return the minimum number of rooms needed so no two overlapping meetings share a room.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["microsoft", "airbnb"],
  },
  {
    slug: "reverse-linked-list",
    title: "Reverse a linked list",
    prompt: "Reverse a singly linked list iteratively, then recursively, and compare the two.",
    category: "CODING",
    difficulty: "EASY",
    companies: ["microsoft"],
  },
  {
    slug: "binary-search-rotated",
    title: "Search in a rotated sorted array",
    prompt:
      "A sorted array of distinct integers was rotated at an unknown pivot. Find the index of a target in O(log n) time.",
    category: "CODING",
    difficulty: "MEDIUM",
    companies: ["meta", "uber"],
  },
  {
    slug: "median-data-stream",
    title: "Median of a data stream",
    prompt:
      "Design a structure that accepts numbers one at a time and returns the current median in O(log n) per insert.",
    category: "CODING",
    difficulty: "HARD",
    companies: ["google", "netflix"],
  },
];

/** The full question bank, in a stable order (seeding is order-independent). */
export const questions: readonly QuestionSeed[] = [...systemDesign, ...behavioral, ...coding];

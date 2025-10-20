import '@/polyfills/location';
import axios, { AxiosError, AxiosInstance } from 'axios';
import Parser from 'rss-parser/dist/rss-parser.min.js';
import { HTTP_CLIENT } from '@/constants';

// RSS parser instance
const rssParser = new Parser({
  timeout: HTTP_CLIENT.TIMEOUT,
  headers: {
    'User-Agent': HTTP_CLIENT.USER_AGENT,
  },
});

// Axios instance configuration
const httpClient: AxiosInstance = axios.create({
  timeout: HTTP_CLIENT.TIMEOUT,
  headers: {
    'User-Agent': HTTP_CLIENT.USER_AGENT,
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
  },
});

// Request interceptor
httpClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    console.error('[HTTP Client] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
httpClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    console.error('[HTTP Client] Response error:', error.message);

    if (error.code === 'ECONNABORTED') {
      console.error('[HTTP Client] Request timeout');
    } else if (error.response) {
      console.error('[HTTP Client] Server error:', error.response.status, error.response.statusText);
    } else if (error.request) {
      console.error('[HTTP Client] Network error, no response received');
    }

    return Promise.reject(error);
  }
);

// Retry configuration
interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
}

// Feed fetch result
export interface FeedFetchResult {
  success: boolean;
  data?: {
    title?: string;
    link?: string;
    description?: string;
    items: Array<{
      id?: string;
      guid?: string;
      title?: string;
      link?: string;
      author?: string;
      pubDate?: string;
      isoDate?: string;
      content?: string;
      contentSnippet?: string;
    }>;
  };
  error?: string;
}

/**
 * Request RSS feed with retry mechanism
 * @param url Feed URL
 * @param retryConfig Retry configuration
 * @returns FeedFetchResult
 */
export async function requestFeed(
  url: string,
  retryConfig: RetryConfig = {}
): Promise<FeedFetchResult> {
  const { maxRetries = HTTP_CLIENT.MAX_RETRIES, retryDelay = HTTP_CLIENT.RETRY_DELAY } = retryConfig;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Fetch the feed content
      const response = await httpClient.get(url, {
        responseType: 'text',
      });

      // Parse RSS/Atom feed
      const feed = await rssParser.parseString(response.data);

      return {
        success: true,
        data: {
          title: feed.title,
          link: feed.link,
          description: feed.description,
          items: feed.items.map(item => ({
            id: item.id,
            guid: item.guid || item.link || item.title || '',
            title: item.title,
            link: item.link,
            author: item.creator || item.author,
            pubDate: item.pubDate,
            isoDate: item.isoDate,
            content: item.content,
            contentSnippet: item.contentSnippet,
          })),
        },
      };
    } catch (error) {
      lastError = error as Error;
      console.error(`[HTTP Client] Attempt ${attempt + 1} failed for ${url}:`, error);

      // Don't retry on last attempt
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error occurred',
  };
}

/**
 * Validate feed URL
 * @param url Feed URL to validate
 * @returns true if valid
 */
export function validateFeedUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

export default httpClient;

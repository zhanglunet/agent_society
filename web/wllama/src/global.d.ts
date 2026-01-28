export {};

declare global {
  function llmChat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): Promise<string>;
}


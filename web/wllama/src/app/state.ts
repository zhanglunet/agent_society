export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type AppStatus =
  | { kind: 'idle'; text: string }
  | { kind: 'loadingModel'; text: string; progress: number }
  | { kind: 'ready'; text: string }
  | { kind: 'generating'; text: string }
  | { kind: 'error'; text: string };

export type GenerationParams = {
  nPredict: number;
  temp: number;
  topK: number;
  topP: number;
};

export type ModelLoadParams = {
  modelUrl: string;
  nCtx: number;
};

export type AppState = {
  status: AppStatus;
  messages: ChatMessage[];
  model: {
    loaded: boolean;
  };
};

export function createInitialState(): AppState {
  return {
    status: { kind: 'idle', text: '未加载模型' },
    messages: [],
    model: { loaded: false },
  };
}

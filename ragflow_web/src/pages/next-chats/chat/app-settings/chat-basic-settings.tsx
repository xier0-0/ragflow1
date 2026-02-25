'use client';

import { KnowledgeBaseFormField } from '@/components/knowledge-base-item';
import { useFormContext } from 'react-hook-form';

export default function ChatBasicSetting() {
  const form = useFormContext();

  return (
    <div className="space-y-8 pb-4">
      {/* 隐藏开场白/关键词分析/TTS/引用/目录增强，保留默认值 */}
      {/* Tavily API Key、元数据过滤隐藏，保持默认 */}
      <KnowledgeBaseFormField></KnowledgeBaseFormField>
    </div>
  );
}

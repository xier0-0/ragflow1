'use client';

import { CrossLanguageFormField } from '@/components/cross-language-form-field';
import { RerankFormFields } from '@/components/rerank';
import { SimilaritySliderFormField } from '@/components/similarity-slider';
import { SwitchFormField } from '@/components/switch-fom-field';
import { TopNFormField } from '@/components/top-n-item';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { UseKnowledgeGraphFormField } from '@/components/use-knowledge-graph-item';
import { useTranslate } from '@/hooks/common-hooks';
import { useFormContext } from 'react-hook-form';
import { DynamicVariableForm } from './dynamic-variable';

export function ChatPromptEngine() {
  const { t } = useTranslate('chat');
  const form = useFormContext();

  return (
    <div className="space-y-8">
      {/* 系统提示词保持默认，不展示 */}
      {/* 隐藏自由度/温度等模型参数在模型设置里处理 */}
      {/* 隐藏相似度 TopN? 需求仅隐藏指定项：保留相似度阈值 */}
      <SimilaritySliderFormField isTooltipShown></SimilaritySliderFormField>
      {/* 隐藏 PageIndex/TopN */}
      {/* <TopNFormField /> */}
      {/* 隐藏多轮对话优化、知识图谱 */}
      {/* <SwitchFormField name={'prompt_config.refine_multiturn'} .../> */}
      {/* <UseKnowledgeGraphFormField name="prompt_config.use_kg" /> */}
      <RerankFormFields></RerankFormFields>
      {/* 跨语言、变量保持默认，不展示 */}
    </div>
  );
}

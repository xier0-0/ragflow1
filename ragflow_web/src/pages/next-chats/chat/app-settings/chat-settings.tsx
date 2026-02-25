import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { DatasetMetadata } from '@/constants/chat';
import { useFetchDialog, useSetDialog } from '@/hooks/use-chat-request';
import {
  removeUselessFieldsFromValues,
  setLLMSettingEnabledValues,
} from '@/utils/form';
import { ModelVariableType } from '@/constants/knowledge';
import { zodResolver } from '@hookform/resolvers/zod';
import { debounce, isEmpty, omit } from 'lodash';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { z } from 'zod';
import ChatBasicSetting from './chat-basic-settings';
import { ChatModelSettings } from './chat-model-settings';
import { ChatPromptEngine } from './chat-prompt-engine';
import { useChatSettingSchema } from './use-chat-setting-schema';

type ChatSettingsProps = { hasSingleChatBox: boolean };

export function ChatSettings({ hasSingleChatBox }: ChatSettingsProps) {
  const formSchema = useChatSettingSchema();
  const { data } = useFetchDialog();
  const { setDialog, loading } = useSetDialog();
  const { id } = useParams();
  const { t } = useTranslation();

  type FormSchemaType = z.infer<typeof formSchema>;

  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    shouldUnregister: false,
    defaultValues: {
      name: '',
      icon: '',
      description: '',
      kb_ids: [],
      prompt_config: {
        quote: true,
        keyword: false,
        tts: false,
        use_kg: false,
        refine_multiturn: true,
        system: '',
        parameters: [],
        reasoning: false,
        cross_languages: [],
        toc_enhance: false,
      },
      top_n: 8,
      similarity_threshold: 0.2,
      vector_similarity_weight: 0.2,
      top_k: 1024,
      meta_data_filter: {
        method: DatasetMetadata.Disabled,
        manual: [],
      },
    },
  });

  async function onSubmit(values: FormSchemaType) {
    const nextValues: Record<string, any> = removeUselessFieldsFromValues(
      values,
      'llm_setting.',
    );

    setDialog({
      ...omit(data, 'operator_permission'),
      ...nextValues,
      dialog_id: id,
    });
  }

  function onInvalid(errors: any) {
    console.log('Form validation failed:', errors);
  }

  useEffect(() => {
    const llmSettingEnabledValues = setLLMSettingEnabledValues(
      data.llm_setting,
    );

    const nextData = {
      ...data,
      ...llmSettingEnabledValues,
    };

    if (!isEmpty(data)) {
      if (!nextData.llm_setting?.parameter) {
        nextData.llm_setting = {
          ...nextData.llm_setting,
          parameter: ModelVariableType.Balance,
        };
      }
      form.reset(nextData as FormSchemaType);
    }
  }, [data, form]);

  useEffect(() => {
    const handler = debounce((values: FormSchemaType) => {
      if (isEmpty(data)) return;
      onSubmit(values);
    }, 300);
    const subscription = form.watch((value) => handler(value as FormSchemaType));
    return () => {
      subscription.unsubscribe();
      handler.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, onSubmit]);

  // 默认展开设置面板

  return (
    <section className="p-5 pb-6 w-[440px] flex flex-col space-y-4">
      <div className="flex justify-between items-center text-base pb-2 mb-2">
        {t('chat.chatSetting')}
      </div>
      <Form {...form}>
        <form
          className="flex-1 flex flex-col min-h-0"
        >
          <section className="space-y-6 overflow-auto flex-1 pr-4 min-h-0">
            <ChatBasicSetting></ChatBasicSetting>
            <Separator />
            <ChatPromptEngine></ChatPromptEngine>
            <Separator />
            <ChatModelSettings></ChatModelSettings>
          </section>
        </form>
      </Form>
    </section>
  );
}

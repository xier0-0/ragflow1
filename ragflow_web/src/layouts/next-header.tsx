import { RAGFlowAvatar } from '@/components/ragflow-avatar';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Segmented, SegmentedValue } from '@/components/ui/segmented';
import { LanguageList, LanguageMap, ThemeEnum } from '@/constants/common';
import { useChangeLanguage } from '@/hooks/logic-hooks';
import { useNavigatePage } from '@/hooks/logic-hooks/navigate-hooks';
import { useNavigateWithFromState } from '@/hooks/route-hook';
import { useFetchUserInfo } from '@/hooks/use-user-setting-request';
import { Routes } from '@/routes';
import { camelCase } from 'lodash';
import { ChevronDown, House, Library, MessageSquareText, Moon, Search, Sun } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { BellButton } from './bell-button';

const PathMap = {
  [Routes.Root]: [Routes.Root],
  [Routes.Datasets]: [Routes.Datasets],
  [Routes.Chats]: [Routes.Chats],
  [Routes.Searches]: [Routes.Searches],
} as const;

export function Header() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigateWithFromState();
  const { navigateToOldProfile } = useNavigatePage();

  const changeLanguage = useChangeLanguage();
  const { setTheme, theme } = useTheme();

  const {
    data: { language = 'English', avatar, nickname },
  } = useFetchUserInfo();

  const handleItemClick = (key: string) => () => {
    changeLanguage(key);
  };

  const items = LanguageList.map((x) => ({
    key: x,
    label: <span>{LanguageMap[x as keyof typeof LanguageMap]}</span>,
  }));

  const onThemeClick = React.useCallback(() => {
    setTheme(theme === ThemeEnum.Dark ? ThemeEnum.Light : ThemeEnum.Dark);
  }, [setTheme, theme]);

  const tagsData = useMemo(
    () => [
      { path: Routes.Root, name: t('header.Root'), icon: House },
      { path: Routes.Datasets, name: t('header.dataset'), icon: Library },
      { path: Routes.Chats, name: t('header.chat'), icon: MessageSquareText },
      { path: Routes.Searches, name: t('header.search'), icon: Search },
      // 隐藏智能体、记忆、文件管理
    ],
    [t],
  );

  const options = useMemo(() => {
    return tagsData.map((tag) => {
      const HeaderIcon = tag.icon;

      return {
        label:
          tag.path === Routes.Root ? (
            <HeaderIcon className="size-6"></HeaderIcon>
          ) : (
            <span>{tag.name}</span>
          ),
        value: tag.path,
      };
    });
  }, [tagsData]);

  // const currentPath = useMemo(() => {
  //   return (
  //     tagsData.find((x) => pathname.startsWith(x.path))?.path || Routes.Root
  //   );
  // }, [pathname, tagsData]);

  const handleChange = (path: SegmentedValue) => {
    navigate(path as Routes);
  };

  const handleLogoClick = useCallback(() => {
    navigate(Routes.Root);
  }, [navigate]);

  const activePathName = useMemo(() => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '/';
    const normalized =
      base !== '/' && pathname.startsWith(base)
        ? pathname.slice(base.length) || '/'
        : pathname;
    const path = normalized.startsWith('/') ? normalized : `/${normalized}`;

    // 首页仅精确匹配 '/' 或 ''，避免 /datasets、/next-chats 等被误判为首页
    if (path === '/' || path === '') return Routes.Root;

    const found = tagsData.find(
      (tag) => tag.path !== Routes.Root && path.startsWith(tag.path),
    );
    if (found) return found.path;
    const fallbackKey = Object.keys(PathMap).find((x) => {
      const paths = PathMap[x as keyof typeof PathMap];
      return paths.some((p) => path.includes(p));
    });
    return (fallbackKey as Routes | undefined) ?? Routes.Root;
  }, [pathname, tagsData]);

  return (
    <header className="sticky top-0 z-30 bg-bg-base/80 backdrop-blur border-b border-border-default">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt="logo"
            className="size-10 cursor-pointer shrink-0"
            onClick={handleLogoClick}
          />
          <span className="text-lg font-semibold hidden sm:inline-flex">
            魔视智能
          </span>
        </div>
        <div className="flex-1 flex justify-center">
          <Segmented
            key={activePathName}
            rounded="xxxl"
            sizeType="xl"
            buttonSize="xl"
            options={options}
            value={activePathName}
            onChange={handleChange}
            className="bg-bg-card px-1 py-1 rounded-full shadow-sm"
            activeClassName="text-bg-base bg-metallic-gradient border-none shadow-sm"
          ></Segmented>
        </div>
        <div className="flex items-center gap-4 text-text-badge">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <div className="flex items-center gap-1">
                {t(`common.${camelCase(language)}`)}
                <ChevronDown className="size-4" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {items.map((x) => (
                <DropdownMenuItem key={x.key} onClick={handleItemClick(x.key)}>
                  {x.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant={'ghost'} onClick={onThemeClick} className="h-9 w-9 p-0">
            {theme === 'light' ? <Sun /> : <Moon />}
          </Button>
          <BellButton></BellButton>
          <div className="relative">
            <RAGFlowAvatar
              name={nickname}
              avatar={avatar}
              isPerson
              className="size-8 cursor-pointer"
              onClick={navigateToOldProfile}
            ></RAGFlowAvatar>
          </div>
        </div>
      </div>
    </header>
  );
}

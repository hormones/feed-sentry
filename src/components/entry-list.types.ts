export interface EntryListItem {
  id: string;
  title: string;
  author?: string | null;
  feedTitle?: string | null;
  createTime?: number;
  isRead: boolean;
  link?: string | null;
  feedId: string;
  keywords?: string[];
  isFavorite?: boolean;
  favoriteId?: string;
}

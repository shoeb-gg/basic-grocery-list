export type ListItem = { id: number; itemName: string; checked: boolean };

export type GroceryList = { id: number; name: string; items: ListItem[] };

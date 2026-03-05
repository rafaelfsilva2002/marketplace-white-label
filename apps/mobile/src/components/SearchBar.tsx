import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { useState, useCallback, useRef } from 'react';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  debounceMs?: number;
}

export function SearchBar({ placeholder = 'Buscar...', onSearch, debounceMs = 400 }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onSearch(text), debounceMs);
    },
    [onSearch, debounceMs],
  );

  return (
    <View className="flex-row items-center bg-muted rounded-lg px-4 py-2">
      <Text className="text-muted-foreground mr-2">🔍</Text>
      <TextInput
        className="flex-1 text-base text-foreground"
        placeholder={placeholder}
        placeholderTextColor="#737373"
        value={query}
        onChangeText={handleChange}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={() => onSearch(query)}
      />
      {query.length > 0 && (
        <TouchableOpacity onPress={() => { setQuery(''); onSearch(''); }}>
          <Text className="text-muted-foreground ml-2">✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

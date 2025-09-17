import React, { useState, useEffect } from 'react';

const ThemeContext = React.createContext();

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Load initial theme from localStorage with robust parsing
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme) return false; // Default to light mode
    
    // Handle boolean strings
    if (savedTheme === 'true') return true;
    if (savedTheme === 'false') return false;
    
    // Handle legacy string values (e.g., "dark" or "light")
    if (savedTheme === 'dark') return true;
    if (savedTheme === 'light') return false;
    
    // Fallback for any invalid data
    console.warn('Invalid theme value in localStorage, defaulting to light mode');
    return false;
  });

  useEffect(() => {
    // Apply theme to body on load or change
    document.body.className = isDarkMode ? 'dark' : '';
    // Save to localStorage as JSON (always "true" or "false")
    localStorage.setItem('theme', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
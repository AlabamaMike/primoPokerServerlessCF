import { test, expect } from '@playwright/test';

test.describe('Game Table UI Components', () => {
  test('should render Card component correctly', async ({ page }) => {
    // Create a simple HTML page to test components in isolation
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Card Component Test</title>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body>
        <div id="root"></div>
        <script type="text/babel">
          const { useState } = React;
          
          const Card = ({ suit, rank, faceDown = false, size = 'medium' }) => {
            const sizeClasses = {
              small: 'w-8 h-12 text-xs',
              medium: 'w-12 h-16 text-sm',
              large: 'w-16 h-24 text-base'
            };

            const suitSymbols = {
              hearts: '♥',
              diamonds: '♦',
              clubs: '♣',
              spades: '♠'
            };

            const suitColors = {
              hearts: 'text-red-600',
              diamonds: 'text-red-600',
              clubs: 'text-black',
              spades: 'text-black'
            };

            if (faceDown) {
              return React.createElement('div', {
                className: sizeClasses[size] + ' bg-blue-800 border-2 border-white rounded-lg flex items-center justify-center shadow-md',
                'data-testid': 'card-face-down'
              }, React.createElement('div', { className: 'text-white text-xs' }, '🂠'));
            }

            return React.createElement('div', {
              className: sizeClasses[size] + ' bg-white border-2 border-gray-300 rounded-lg flex flex-col items-center justify-between p-1 shadow-md',
              'data-testid': 'card-' + suit + '-' + rank
            }, [
              React.createElement('div', { 
                key: 'top',
                className: 'font-bold ' + suitColors[suit] 
              }, rank),
              React.createElement('div', { 
                key: 'middle',
                className: 'text-xl ' + suitColors[suit] 
              }, suitSymbols[suit]),
              React.createElement('div', { 
                key: 'bottom',
                className: 'font-bold ' + suitColors[suit] + ' transform rotate-180' 
              }, rank)
            ]);
          };

          const App = () => {
            return React.createElement('div', { className: 'p-4 space-y-4' }, [
              React.createElement('h1', { key: 'title', className: 'text-2xl font-bold' }, 'Card Component Test'),
              React.createElement('div', { key: 'cards', className: 'flex space-x-4' }, [
                React.createElement(Card, { key: 'ah', suit: 'hearts', rank: 'A' }),
                React.createElement(Card, { key: 'kd', suit: 'diamonds', rank: 'K' }),
                React.createElement(Card, { key: 'qc', suit: 'clubs', rank: 'Q' }),
                React.createElement(Card, { key: 'js', suit: 'spades', rank: 'J' }),
                React.createElement(Card, { key: 'face-down', faceDown: true })
              ])
            ]);
          };

          ReactDOM.render(React.createElement(App), document.getElementById('root'));
        </script>
      </body>
      </html>
    `);

    // Test card components
    await expect(page.locator('[data-testid="card-hearts-A"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-diamonds-K"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-clubs-Q"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-spades-J"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-face-down"]')).toBeVisible();

    // Test card content
    const aceOfHearts = page.locator('[data-testid="card-hearts-A"]');
    await expect(aceOfHearts).toContainText('A');
    await expect(aceOfHearts).toContainText('♥');

    const kingOfDiamonds = page.locator('[data-testid="card-diamonds-K"]');
    await expect(kingOfDiamonds).toContainText('K');
    await expect(kingOfDiamonds).toContainText('♦');
  });

  test('should display correct card colors', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body>
        <div id="root"></div>
        <script type="text/babel">
          const Card = ({ suit, rank }) => {
            const suitSymbols = {
              hearts: '♥',
              diamonds: '♦',
              clubs: '♣',
              spades: '♠'
            };

            const suitColors = {
              hearts: 'text-red-600',
              diamonds: 'text-red-600',
              clubs: 'text-black',
              spades: 'text-black'
            };

            return React.createElement('div', {
              className: 'w-12 h-16 bg-white border-2 border-gray-300 rounded-lg flex flex-col items-center justify-between p-1',
              'data-testid': 'card-' + suit + '-' + rank
            }, [
              React.createElement('div', { 
                key: 'rank',
                className: 'font-bold ' + suitColors[suit] 
              }, rank),
              React.createElement('div', { 
                key: 'suit',
                className: 'text-xl ' + suitColors[suit] 
              }, suitSymbols[suit])
            ]);
          };

          const App = () => {
            return React.createElement('div', { className: 'flex space-x-2' }, [
              React.createElement(Card, { key: 'red1', suit: 'hearts', rank: 'A' }),
              React.createElement(Card, { key: 'red2', suit: 'diamonds', rank: 'K' }),
              React.createElement(Card, { key: 'black1', suit: 'clubs', rank: 'Q' }),
              React.createElement(Card, { key: 'black2', suit: 'spades', rank: 'J' })
            ]);
          };

          ReactDOM.render(React.createElement(App), document.getElementById('root'));
        </script>
      </body>
      </html>
    `);

    // Check that red suits have red color class
    const heartsCard = page.locator('[data-testid="card-hearts-A"]');
    await expect(heartsCard.locator('.text-red-600')).toHaveCount(2); // rank and suit

    const diamondsCard = page.locator('[data-testid="card-diamonds-K"]');  
    await expect(diamondsCard.locator('.text-red-600')).toHaveCount(2);

    // Check that black suits have black color class
    const clubsCard = page.locator('[data-testid="card-clubs-Q"]');
    await expect(clubsCard.locator('.text-black')).toHaveCount(2);

    const spadesCard = page.locator('[data-testid="card-spades-J"]');
    await expect(spadesCard.locator('.text-black')).toHaveCount(2);
  });

  test('should render face-down cards correctly', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body>
        <div id="root"></div>
        <script type="text/babel">
          const Card = ({ faceDown = false }) => {
            if (faceDown) {
              return React.createElement('div', {
                className: 'w-12 h-16 bg-blue-800 border-2 border-white rounded-lg flex items-center justify-center shadow-md',
                'data-testid': 'card-face-down'
              }, React.createElement('div', { className: 'text-white text-xs' }, '🂠'));
            }
            return React.createElement('div', { className: 'w-12 h-16 bg-white' }, 'Face up');
          };

          const App = () => {
            return React.createElement('div', { className: 'space-x-2 flex' }, [
              React.createElement(Card, { key: 'down1', faceDown: true }),
              React.createElement(Card, { key: 'down2', faceDown: true }),
              React.createElement(Card, { key: 'up', faceDown: false })
            ]);
          };

          ReactDOM.render(React.createElement(App), document.getElementById('root'));
        </script>
      </body>
      </html>
    `);

    // Should show face-down cards
    await expect(page.locator('[data-testid="card-face-down"]')).toHaveCount(2);
    
    // Face-down cards should have blue background
    const faceDownCard = page.locator('[data-testid="card-face-down"]').first();
    await expect(faceDownCard).toHaveClass(/bg-blue-800/);
    
    // Face-down cards should contain the card back symbol
    await expect(faceDownCard).toContainText('🂠');
  });
});
// src/react-app/components/tools/JsonFormatter.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Route } from './+types/json';
export function meta({}: Route.MetaArgs) {
  return [
    { title: 'JSON Formatter' },
    { name: 'description', content: 'Format and validate JSON' },
  ];
}

export default function Json() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const formatJson = () => {
    try {
      if (!input.trim()) {
        setError('Please enter some JSON to format');
        setOutput('');
        return;
      }

      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);
      setOutput(formatted);
      setError('');
    } catch (err) {
      setError('Invalid JSON: ' + (err as Error).message);
      setOutput('');
    }
  };

  const copyToClipboard = () => {
    if (output) {
      navigator.clipboard.writeText(output);
    }
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>JSON Formatter</CardTitle>
          <CardDescription>
            Paste your JSON string below and click "Format" to visualize it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label
                className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300"
                htmlFor="jsonInput"
              >
                JSON Input
              </Label>
              <Textarea
                className="h-40 w-full"
                id="jsonInput"
                onChange={(e) => setInput(e.target.value)}
                placeholder='{ "name": "John", "age": 30 }'
                value={input}
              />
            </div>

            <div className="flex space-x-2">
              <Button onClick={formatJson}>Format</Button>
              <Button
                disabled={!output}
                onClick={copyToClipboard}
                variant="outline"
              >
                Copy
              </Button>
              <Button onClick={clearAll} variant="outline">
                Clear
              </Button>
            </div>

            {error && (
              <div className="rounded bg-red-50 p-2 text-red-500 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <Label
                className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300"
                htmlFor="jsonOutput"
              >
                Formatted Output
              </Label>
              <div
                className="h-40 w-full overflow-auto whitespace-pre rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-gray-900 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                id="jsonOutput"
              >
                {output || 'Formatted JSON will appear here'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

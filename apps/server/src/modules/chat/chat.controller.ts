import { Body, Controller, Get, Param, Post } from '@tsuki-hono/common';
import { chatService } from '@kansoku/core/ai/chat/chat.service';
import { ClientError } from '@kansoku/core/platform/errors';
import { jsonResponse } from '../../httpResponse.js';

export {
  setChatDepsForTests,
  setChatSuggestionDepsForTests,
} from '@kansoku/core/ai/chat/chat.service';

@Controller('charts')
export class ChatController {
  @Get('/:id/chat')
  async getChat(@Param('id') id: string) {
    return chatService.get({ id });
  }

  @Post('/:id/chat/messages')
  async postMessage(@Param('id') id: string, @Body() body: { text?: unknown } | null) {
    const text = body?.text;
    if (typeof text !== 'string') {
      throw new ClientError(
        '`text` must be a non-empty string of at most 4000 characters',
        'e.g. {"text": "..."}',
      );
    }
    const result = await chatService.postMessage({ id, text });
    return jsonResponse(result.status, result.body);
  }

  @Post('/:id/chat/abort')
  async abort(@Param('id') id: string) {
    const result = await chatService.abort({ id });
    return jsonResponse(result.status, result.body);
  }

  @Get('/:id/chat/suggestions')
  async suggestions(@Param('id') id: string) {
    return chatService.suggestions({ id });
  }
}

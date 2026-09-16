'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  THIRD_PARTY_PLATFORMS,
  validateOrderInput,
  normalizePlatform,
  getWorkflowStage,
  canReview,
  canResubmit,
  canRequestCompletion,
  canReturnCompletion,
  canConfirmPayment
} = require('../lib/third-party-workflow');

test('third-party platform accepts game servers and rejects marketplace labels', () => {
  for (const platform of ['安卓官服', 'iOS官服', '亚服', '安卓渠道服']) {
    const result = validateOrderInput({
      platform, content: '冲分任务', account_info: 'player@example.com', price: 88
    });
    assert.equal(result.error, undefined);
  }
  assert.equal(THIRD_PARTY_PLATFORMS.includes('闲鱼'), false);
  assert.equal(normalizePlatform('闲鱼'), '其他服务器');
  assert.equal(normalizePlatform('安卓官服'), '安卓官服');
  assert.match(validateOrderInput({
    platform: '闲鱼', content: '冲分任务', account_info: 'account', price: 88
  }).error, /游戏服务器/);
});

test('third-party order input rejects incomplete and unsafe values', () => {
  assert.match(validateOrderInput({ platform: '安卓官服', content: '', account_info: 'a', price: 1 }).error, /代练内容/);
  assert.match(validateOrderInput({ platform: '安卓官服', content: '任务', account_info: 'a', price: 0 }).error, /价格/);
  assert.match(validateOrderInput({ platform: '安卓官服', content: '任务', account_info: 'a', price: 1, expected_at: 'invalid' }).error, /完成时间/);
});

test('workflow stage follows review and acceptance state', () => {
  assert.equal(getWorkflowStage({ status: 'pending' }), 'pending');
  assert.equal(getWorkflowStage({ status: 'rejected' }), 'rejected');
  assert.equal(getWorkflowStage({ status: 'approved', complete_requested: 0 }), 'in_progress');
  assert.equal(getWorkflowStage({ status: 'approved', complete_requested: 1 }), 'awaiting_acceptance');
  assert.equal(getWorkflowStage({ status: 'approved', complete_requested: 1, final_status: 'completed' }), 'completed');
});

test('workflow actions are allowed only from their expected state', () => {
  assert.equal(canReview({ status: 'pending' }), true);
  assert.equal(canReview({ status: 'approved' }), false);
  assert.equal(canResubmit({ status: 'rejected', payment_status: 'unpaid' }), true);
  assert.equal(canResubmit({ status: 'rejected', payment_status: 'paid' }), false);
  assert.equal(canRequestCompletion({ status: 'approved', complete_requested: 0 }), true);
  assert.equal(canRequestCompletion({ status: 'pending', complete_requested: 0 }), false);
  assert.equal(canReturnCompletion({ status: 'approved', complete_requested: 1 }), true);
  assert.equal(canReturnCompletion({ status: 'approved', complete_requested: 0 }), false);
  assert.equal(canConfirmPayment({ status: 'approved', payment_status: 'unpaid' }), true);
  assert.equal(canConfirmPayment({ status: 'rejected', payment_status: 'unpaid' }), false);
});

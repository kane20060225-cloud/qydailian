'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {render} = require('../../public/profile-dashboard');
test('profile escapes account data and shows booster fields only for staff', () => {
    const user = {username:'<img src=x onerror=alert(1)>',email:'<script>bad</script>',role:'user',referral_code:'"<test>',created_at:'invalid'};
    const html = render(user, {});
    assert.ok(html.includes('&lt;img'));
    assert.ok(!html.includes('<script>bad'));
    assert.ok(!html.includes('打手积分'));
    assert.ok(html.includes('暂无记录'));
    assert.ok(render({...user,role:'booster',booster_identity:'gold',booster_points:1234}, {}).includes('金牌打手'));
});
test('membership progress stays bounded and highest VIP has no fictitious upgrade', () => {
    const normal = render({}, {vip_level:4,total_earned_credits:9321,qy_credits:8319});
    assert.ok(normal.includes('8,319'));
    assert.ok(normal.includes('5,679'));
    assert.ok(normal.includes('aria-valuenow="36"'));
    const highest = render({}, {vip_level:5,total_earned_credits:20000});
    assert.ok(highest.includes('已达最高等级'));
    assert.ok(highest.includes('aria-valuenow="100"'));
    assert.ok(!highest.includes('VIP 6'));
    assert.ok(render({}, {vip_level:4,total_earned_credits:1}).includes('aria-valuenow="0"'));
});

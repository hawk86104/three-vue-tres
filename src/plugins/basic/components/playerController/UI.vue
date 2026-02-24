<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-02-24 16:28:05
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-02-24 16:30:06
-->
<template>
	<div class="hud" role="note" aria-label="操作提示">
		<div class="row hint-group">
			<span class="hint-text">控制移动：</span>
			<kbd>W</kbd>
			<kbd>A</kbd>
			<kbd>S</kbd>
			<kbd>D</kbd>
		</div>
		<div class="row hint-group">
			<span class="hint-text">加速：</span>
			<kbd>Shift</kbd>
		</div>
		<div class="row hint-group">
			<span class="hint-text">跳跃：</span>
			<kbd>Space</kbd>
		</div>
		<div class="row hint-group">
			<span class="hint-text">切换视角：</span>
			<kbd>V</kbd>
		</div>
		<div class="row hint-group">
			<span class="hint-text">切换飞行模式：</span>
			<kbd>F</kbd>
		</div>
	</div>

</template>

<script setup lang="ts">
</script>

<style scoped lang="less">
.hud {
	position: fixed;
	left: 12px;
	top: 48px;
	z-index: 9999;
	background: rgba(0, 0, 0, 0.98);
	color: #fff;
	padding: 10px 12px;
	border-radius: 8px;
	font-family:
		system-ui,
		-apple-system,
		"Segoe UI",
		Roboto,
		"Helvetica Neue",
		Arial;
	font-size: 16px;
	line-height: 1.3;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.65);
	backdrop-filter: blur(4px);
}

.hud .row {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 6px;
}

.hud .row:last-child {
	margin-bottom: 0;
}

kbd {
	display: inline-block;
	padding: 4px 7px;
	min-width: 20px;
	text-align: center;
	font-family: ui-monospace, "SFMono-Regular", Menlo, Monaco, "Roboto Mono", "Segoe UI Mono", monospace;
	font-size: 12px;
	line-height: 1;
	color: #111;
	background: linear-gradient(#f6f6f6, #e3e3e3);
	border: 1px solid rgba(0, 0, 0, 0.15);
	border-bottom-width: 2px;
	border-radius: 6px;
	box-shadow:
		0 1px 0 rgba(255, 255, 255, 0.6) inset,
		0 2px 4px rgba(0, 0, 0, 0.25);
}

/* 说明文本与小图标的间距 */
.hint-text {
	color: #e6eef6;
	font-size: 13px;
}

.hint-group {
	display: flex;
	align-items: center;
	gap: 6px;
}

@media (max-width: 480px) {
	.hud {
		font-size: 12px;
		padding: 8px;
		left: 8px;
		top: 8px;
	}

	kbd {
		padding: 3px 6px;
		min-width: 18px;
		font-size: 11px;
	}
}

.model-credit {
	position: fixed;
	top: 10px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 9999;
	font-size: 16px;
	color: #e6eef6;
	background: rgba(0, 0, 0, 0.35);
	padding: 6px 12px;
	border-radius: 999px;
	backdrop-filter: blur(4px);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
	font-family:
		system-ui,
		-apple-system,
		"Segoe UI",
		Roboto,
		Arial;
}

.model-credit a {
	color: #6ecbff;
	text-decoration: none;
}

.model-credit a:hover {
	text-decoration: underline;
}

.source {
	position: fixed;
	bottom: 16px;
	right: 16px;
	padding: 12px;
	border-radius: 50%;
	margin-bottom: 0px;
	background-color: #fff;
	opacity: 0.9;
	z-index: 999;
	box-shadow: 0 0 4px rgba(0, 0, 0, 0.15);

	img {
		display: block;
		width: 24px;
	}
}

@media (hover: none) and (pointer: coarse),
(max-width: 768px) {

	.hud,
	.source {
		display: none !important;
	}
}
</style>
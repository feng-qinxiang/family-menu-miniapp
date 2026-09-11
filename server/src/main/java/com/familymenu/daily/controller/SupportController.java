package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.dto.ApiModels.FeedbackReceipt;
import com.familymenu.daily.dto.ApiModels.FeedbackRequest;
import com.familymenu.daily.dto.ApiModels.MarkNotificationsReadRequest;
import com.familymenu.daily.dto.ApiModels.NotificationSummary;
import com.familymenu.daily.dto.ApiModels.SubscribeSetting;
import com.familymenu.daily.dto.ApiModels.UpdateSubscribeRequest;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.SubscribeMessageService;
import com.familymenu.daily.service.SupportService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class SupportController {

    private final SupportService supportService;
    private final SubscribeMessageService subscribeMessageService;

    public SupportController(SupportService supportService, SubscribeMessageService subscribeMessageService) {
        this.supportService = supportService;
        this.subscribeMessageService = subscribeMessageService;
    }

    @PostMapping("/feedback")
    public FeedbackReceipt submitFeedback(@CurrentUser AuthUser user,
                                          @Valid @RequestBody FeedbackRequest request) {
        return supportService.submitFeedback(user, request);
    }

    @GetMapping("/notifications")
    public NotificationSummary notifications(@CurrentUser AuthUser user) {
        return supportService.listNotifications(user);
    }

    @PatchMapping("/notifications/read")
    public NotificationSummary markNotificationsRead(@CurrentUser AuthUser user,
                                                     @RequestBody(required = false) MarkNotificationsReadRequest request) {
        return supportService.markRead(user, request);
    }

    /**
     * 微信订阅消息设置：读开关状态，并把模板 ID 下发给客户端。
     * 模板 ID 放在服务端配置里（application.yml），前端调 wx.requestSubscribeMessage 时向这里取，
     * 避免模板 ID 在小程序与后端各写一份、改一处忘一处。
     */
    @GetMapping("/notifications/subscribe")
    public SubscribeSetting subscribeSetting(@CurrentUser AuthUser user) {
        return subscribeMessageService.setting(user.userId());
    }

    /** 打开/关闭消息通知。注意：开关只是"愿不愿意收"，真正能不能发还取决于微信侧的授权配额。 */
    @PatchMapping("/notifications/subscribe")
    public SubscribeSetting updateSubscribe(@CurrentUser AuthUser user,
                                            @Valid @RequestBody UpdateSubscribeRequest request) {
        return subscribeMessageService.updateEnabled(user.userId(), request.enabled());
    }
}

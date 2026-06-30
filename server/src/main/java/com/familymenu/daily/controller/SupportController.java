package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.dto.ApiModels.FeedbackReceipt;
import com.familymenu.daily.dto.ApiModels.FeedbackRequest;
import com.familymenu.daily.dto.ApiModels.MarkNotificationsReadRequest;
import com.familymenu.daily.dto.ApiModels.NotificationSummary;
import com.familymenu.daily.dto.AuthModels.AuthUser;
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

    public SupportController(SupportService supportService) {
        this.supportService = supportService;
    }

    @PostMapping("/feedback")
    public FeedbackReceipt submitFeedback(@CurrentUser(orGuest = true) AuthUser user,
                                          @Valid @RequestBody FeedbackRequest request) {
        return supportService.submitFeedback(user, request);
    }

    @GetMapping("/notifications")
    public NotificationSummary notifications(@CurrentUser(orGuest = true) AuthUser user) {
        return supportService.listNotifications(user);
    }

    @PatchMapping("/notifications/read")
    public NotificationSummary markNotificationsRead(@CurrentUser(orGuest = true) AuthUser user,
                                                     @RequestBody(required = false) MarkNotificationsReadRequest request) {
        return supportService.markRead(user, request);
    }
}
